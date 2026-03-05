import { getStripe } from "./stripe-client";
import { getPriceId } from "./plans";
import knexDb from "../db";
import { PlanTier, SubscriptionStatus } from "../types/billing";

/** Local alias — the Knex db singleton. */
function getDb() {
  return knexDb;
}

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

// ── Customer management ─────────────────────────────────────────────────

export async function ensureStripeCustomer(
  parentId: string,
  email: string,
  name: string
): Promise<string> {
  const db = getDb();
  const row = db
    .prepare("SELECT stripe_customer_id FROM parents WHERE id = ?")
    .get(parentId) as { stripe_customer_id: string | null } | undefined;

  if (row?.stripe_customer_id) return row.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { parent_id: parentId },
  });

  db.prepare(
    `INSERT INTO parents (id, email, name, stripe_customer_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id`
  ).run(parentId, email, name, customer.id);

  return customer.id;
}

// ── Subscription creation ───────────────────────────────────────────────

export interface CreateSubscriptionResult {
  subscriptionId: string;
  clientSecret: string | null; // for confirming payment on the frontend
}

/**
 * Create a new weekly subscription for a parent.
 *
 * Uses `billing_cycle_anchor` to pin billing to Friday noon UTC.
 * Charges immediately for the first partial week (Stripe handles this).
 */
export async function createSubscription(
  parentId: string,
  stripeCustomerId: string,
  tier: PlanTier
): Promise<CreateSubscriptionResult> {
  const stripe = getStripe();
  const priceId = await getPriceId(tier, knexDb);

  const anchor = nextFridayNoon();
  const anchorUnix = Math.floor(anchor.getTime() / 1000);

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    billing_cycle_anchor: anchorUnix,
    proration_behavior: "create_prorations", // charges partial first week
    payment_behavior: "default_incomplete", // require payment confirmation
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.payment_intent"],
    metadata: { parent_id: parentId, plan_tier: tier },
  });

  // Persist locally.
  const billingDate = anchor.toISOString();
  const periodEnd = periodEndForBillingDate(anchor).toISOString();

  const db = getDb();
  db.prepare(
    `INSERT INTO subscriptions
       (parent_id, stripe_subscription_id, plan_tier, status, next_billing_date, current_period_end)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(parentId, subscription.id, tier, subscription.status, billingDate, periodEnd);

  // Extract client secret for frontend payment confirmation.
  const invoice = subscription.latest_invoice as any;
  const clientSecret = invoice?.payment_intent?.client_secret ?? null;

  return { subscriptionId: subscription.id, clientSecret };
}

// ── Plan change (mid-cycle → next week) ─────────────────────────────────

export async function requestPlanChange(
  parentId: string,
  newTier: PlanTier
): Promise<{ effectiveDate: string }> {
  const db = getDb();

  const sub = db
    .prepare(
      "SELECT id, plan_tier, next_billing_date FROM subscriptions WHERE parent_id = ? AND status = 'active'"
    )
    .get(parentId) as
    | { id: string; plan_tier: string; next_billing_date: string }
    | undefined;

  if (!sub) throw new Error("No active subscription found for this parent.");
  if (sub.plan_tier === newTier) throw new Error("Already on that plan.");

  const effectiveDate = sub.next_billing_date; // next Friday

  // Upsert pending change (one pending change per subscription at a time).
  db.prepare(
    `INSERT INTO pending_plan_changes (subscription_id, new_plan_tier, effective_date)
     VALUES (?, ?, ?)
     ON CONFLICT(subscription_id) DO UPDATE SET
       new_plan_tier = excluded.new_plan_tier,
       effective_date = excluded.effective_date`
  ).run(sub.id, newTier, effectiveDate);

  return { effectiveDate };
}

/**
 * Apply pending plan changes. Called by a cron job on Friday noon or
 * triggered by the `invoice.paid` webhook when the new cycle starts.
 */
export async function applyPendingChanges(): Promise<number> {
  const db = getDb();
  const stripe = getStripe();

  const pending = db
    .prepare(
      `SELECT pc.id, pc.subscription_id, pc.new_plan_tier, s.stripe_subscription_id
       FROM pending_plan_changes pc
       JOIN subscriptions s ON s.id = pc.subscription_id
       WHERE pc.effective_date <= datetime('now')`
    )
    .all() as Array<{
    id: string;
    subscription_id: string;
    new_plan_tier: PlanTier;
    stripe_subscription_id: string;
  }>;

  for (const change of pending) {
    const newPriceId = await getPriceId(change.new_plan_tier, knexDb);

    // Get current subscription item to swap the price.
    const stripeSub = await stripe.subscriptions.retrieve(
      change.stripe_subscription_id
    );
    const itemId = stripeSub.items.data[0].id;

    await stripe.subscriptions.update(change.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "none", // already at cycle boundary
      metadata: { plan_tier: change.new_plan_tier },
    });

    db.prepare(
      "UPDATE subscriptions SET plan_tier = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(change.new_plan_tier, change.subscription_id);

    db.prepare("DELETE FROM pending_plan_changes WHERE id = ?").run(change.id);
  }

  return pending.length;
}

// ── Cancellation ────────────────────────────────────────────────────────

/**
 * Cancel at period end: the parent keeps access until the paid week expires,
 * then the subscription transitions to 'canceled'.
 */
export async function cancelSubscription(parentId: string): Promise<string> {
  const db = getDb();

  const sub = db
    .prepare(
      "SELECT stripe_subscription_id, current_period_end FROM subscriptions WHERE parent_id = ? AND status IN ('active','past_due')"
    )
    .get(parentId) as
    | { stripe_subscription_id: string; current_period_end: string }
    | undefined;

  if (!sub) throw new Error("No active subscription to cancel.");

  const stripe = getStripe();
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  return sub.current_period_end; // reservations valid until this date
}

// ── Status queries ──────────────────────────────────────────────────────

export function getActiveSubscription(parentId: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM subscriptions WHERE parent_id = ? AND status = 'active'"
    )
    .get(parentId) as Record<string, unknown> | undefined;
}

export function canReserve(parentId: string): boolean {
  const sub = getActiveSubscription(parentId);
  return !!sub;
}

// ── Webhook-scoped pending change application ───────────────────────────

/**
 * Apply pending plan changes for a single subscription (called from webhook handler).
 * Uses the provided Knex transaction so everything is atomic with the webhook processing.
 */
export async function applyPendingChangesForSubscription(
  trx: import("knex").Knex,
  stripeSubscriptionId: string
): Promise<void> {
  const stripe = getStripe();

  const pending = await trx("pending_plan_changes as pc")
    .join("subscriptions as s", "s.id", "pc.subscription_id")
    .where("s.stripe_subscription_id", stripeSubscriptionId)
    .where("pc.effective_date", "<=", trx.fn.now())
    .select("pc.id", "pc.subscription_id", "pc.new_plan_tier", "s.stripe_subscription_id");

  for (const change of pending) {
    const newPriceId = await getPriceId(change.new_plan_tier as PlanTier, trx);

    const stripeSub = await stripe.subscriptions.retrieve(change.stripe_subscription_id);
    const itemId = stripeSub.items.data[0].id;

    await stripe.subscriptions.update(change.stripe_subscription_id, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "none",
      metadata: { plan_tier: change.new_plan_tier },
    });

    await trx("subscriptions")
      .where({ id: change.subscription_id })
      .update({ plan_tier: change.new_plan_tier, updated_at: trx.fn.now() });

    await trx("pending_plan_changes").where({ id: change.id }).del();
  }
}
