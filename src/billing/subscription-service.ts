import db from "../db";
import { getStripe } from "./stripe-client";
import { getPriceId } from "./plans";
import { PlanTier, SubscriptionStatus } from "../types/billing";
import type Stripe from "stripe";
import type { Knex } from "knex";

// ---------------------------------------------------------------------------
// Mid-cycle change policy: APPLY AT NEXT BILLING WEEK
//
// When a parent changes their plan tier mid-cycle:
//   1. The change is queued in `pending_plan_changes`.
//   2. The parent keeps their current tier for the remainder of the paid week.
//   3. On the next Friday billing run, the Stripe subscription is updated to
//      the new price and the parent is charged the new amount.
//
// This avoids proration complexity, is easy to explain to parents, and
// prevents mid-week scheduling confusion.
// ---------------------------------------------------------------------------

/**
 * Compute the next Friday at noon UTC from a given date.
 * If today is Friday and it's before noon, returns today. Otherwise next Friday.
 */
export function nextFridayNoon(from: Date = new Date()): Date {
  const d = new Date(from);
  const day = d.getUTCDay(); // 0=Sun … 5=Fri
  let daysUntilFriday = (5 - day + 7) % 7;
  if (daysUntilFriday === 0 && d.getUTCHours() >= 12) {
    daysUntilFriday = 7;
  }
  d.setUTCDate(d.getUTCDate() + daysUntilFriday);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

/** Thursday 23:59:59 UTC — the end of the paid week. */
export function periodEndForBillingDate(billingDate: Date): Date {
  const d = new Date(billingDate);
  d.setUTCDate(d.getUTCDate() + 6); // Friday + 6 = Thursday
  d.setUTCHours(23, 59, 59, 0);
  return d;
}

/** Map Stripe subscription status to our internal status. */
function mapStripeStatusToInternal(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
    default:
      return "incomplete";
  }
}

// ── Customer management ─────────────────────────────────────────────────

/**
 * Ensure a Stripe customer exists for the parent. Idempotent.
 *
 * SECURITY: email/name are sourced from the parent DB record, NOT from
 * client input, to prevent spoofing.
 */
export async function ensureStripeCustomer(parentId: string): Promise<string> {
  const parent = await db("parents").where({ id: parentId }).first();
  if (!parent) throw new Error("Parent not found");

  if (parent.stripe_customer_id) return parent.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: parent.email,
    name: parent.name,
    metadata: { parent_id: parentId },
  });

  await db("parents")
    .where({ id: parentId })
    .update({ stripe_customer_id: customer.id });

  return customer.id;
}

// ── Subscription creation ───────────────────────────────────────────────

export interface CreateSubscriptionResult {
  subscriptionId: string;
  clientSecret: string | null;
  alreadyExists?: boolean;
}

/**
 * Create a new weekly subscription for a parent. Idempotent + one-active guard.
 *
 * Uses a transaction with a partial unique index (enforced at DB level) to
 * prevent duplicate active subscriptions. If one already exists, returns it
 * rather than creating a duplicate.
 *
 * Uses `proration_behavior: "none"` for simple weekly billing (no proration).
 * Uses `billing_cycle_anchor` to pin billing to Friday noon UTC.
 */
export async function createSubscription(
  parentId: string,
  tier: PlanTier
): Promise<CreateSubscriptionResult> {
  return db.transaction(async (trx: Knex.Transaction) => {
    // Block multiple active subs — the partial unique index also enforces this,
    // but checking first gives a better return value.
    const existing = await trx("subscriptions")
      .where({ parent_id: parentId })
      .whereIn("status", ["active", "past_due", "incomplete"])
      .first();

    if (existing) {
      return {
        subscriptionId: existing.stripe_subscription_id,
        clientSecret: null,
        alreadyExists: true,
      };
    }

    const parent = await trx("parents").where({ id: parentId }).first();
    if (!parent?.stripe_customer_id) {
      throw new Error("Missing stripe_customer_id — call ensureStripeCustomer first");
    }

    const stripe = getStripe();
    const priceId = await getPriceId(tier);

    const anchor = nextFridayNoon();
    const anchorUnix = Math.floor(anchor.getTime() / 1000);

    const subscription = await stripe.subscriptions.create({
      customer: parent.stripe_customer_id,
      items: [{ price: priceId }],
      billing_cycle_anchor: anchorUnix,
      proration_behavior: "none",
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: { parent_id: parentId, plan_tier: tier },
    });

    const invoice = subscription.latest_invoice as any;
    const clientSecret: string | null =
      invoice?.payment_intent?.client_secret ?? null;

    const billingDate = anchor.toISOString();
    const periodEnd = periodEndForBillingDate(anchor).toISOString();

    await trx("subscriptions").insert({
      parent_id: parentId,
      stripe_subscription_id: subscription.id,
      plan_tier: tier,
      status: mapStripeStatusToInternal(subscription.status),
      stripe_status: subscription.status,
      next_billing_date: billingDate,
      current_period_end: periodEnd,
    });

    return { subscriptionId: subscription.id, clientSecret };
  });
}

// ── Plan change (mid-cycle → next week) ─────────────────────────────────

/**
 * Queue a plan-tier change for the next billing cycle. Transactional + idempotent.
 *
 * Uses ON CONFLICT on the unique subscription_id column to upsert, so
 * retries and rapid re-submissions are safe.
 */
export async function requestPlanChange(
  parentId: string,
  newTier: PlanTier
): Promise<{ effectiveDate: string }> {
  return db.transaction(async (trx: Knex.Transaction) => {
    const sub = await trx("subscriptions")
      .where({ parent_id: parentId, status: "active" })
      .first();

    if (!sub) throw new Error("No active subscription found for this parent.");
    if (sub.plan_tier === newTier) throw new Error("Already on that plan.");

    const effectiveDate = sub.next_billing_date;

    await trx("pending_plan_changes")
      .insert({
        subscription_id: sub.id,
        new_plan_tier: newTier,
        effective_date: effectiveDate,
      })
      .onConflict("subscription_id")
      .merge({
        new_plan_tier: newTier,
        effective_date: effectiveDate,
      });

    return { effectiveDate };
  });
}

/**
 * Apply pending plan changes for a SINGLE subscription. Scoped + idempotent.
 *
 * Called from the invoice.paid webhook handler inside a transaction.
 * Only processes changes whose effective_date has passed.
 */
export async function applyPendingChangesForSubscription(
  trx: Knex.Transaction,
  stripeSubId: string
): Promise<void> {
  const sub = await trx("subscriptions")
    .where({ stripe_subscription_id: stripeSubId })
    .first();
  if (!sub) return;

  const pending = await trx("pending_plan_changes")
    .where({ subscription_id: sub.id })
    .andWhere("effective_date", "<=", trx.fn.now())
    .first();

  if (!pending) return;

  const stripe = getStripe();
  const newPriceId = await getPriceId(pending.new_plan_tier);

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  const itemId = stripeSub.items.data[0]?.id;
  if (!itemId) throw new Error("Stripe subscription has no items");

  await stripe.subscriptions.update(stripeSubId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: "none",
    metadata: { plan_tier: pending.new_plan_tier },
  });

  await trx("subscriptions")
    .where({ id: sub.id })
    .update({ plan_tier: pending.new_plan_tier, updated_at: trx.fn.now() });

  await trx("pending_plan_changes").where({ id: pending.id }).delete();
}

// ── Cancellation ────────────────────────────────────────────────────────

/**
 * Cancel at period end: the parent keeps access until the paid week expires,
 * then the subscription transitions to 'canceled' via Stripe webhook.
 */
export async function cancelSubscription(parentId: string): Promise<string> {
  const sub = await db("subscriptions")
    .where({ parent_id: parentId })
    .whereIn("status", ["active", "past_due"])
    .first();

  if (!sub) throw new Error("No active subscription to cancel.");

  const stripe = getStripe();
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  return sub.current_period_end;
}

// ── Status queries ──────────────────────────────────────────────────────

export async function getActiveSubscription(parentId: string) {
  return db("subscriptions")
    .where({ parent_id: parentId, status: "active" })
    .first();
}

/**
 * Check whether a parent may reserve nights.
 *
 * Verifies:
 *   - An active subscription exists
 *   - current_period_end has not passed (i.e. the paid week is still valid)
 */
export async function canReserve(parentId: string): Promise<boolean> {
  const sub = await db("subscriptions")
    .where({ parent_id: parentId, status: "active" })
    .andWhere("current_period_end", ">=", db.fn.now())
    .first();

  return Boolean(sub);
}
