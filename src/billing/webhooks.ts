import Stripe from "stripe";
import type { Request, Response } from "express";
import db from "../db"; // knex instance (singleton)
import { getStripe } from "./stripe-client";
import { applyPendingChangesForSubscription, nextFridayNoon, periodEndForBillingDate } from "./subscription-service";

export function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = constructEvent(req.body as Buffer, sig);
  } catch (err: any) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    // Transaction-safe idempotency pattern:
    // 1) Insert event row first (ON CONFLICT DO NOTHING)
    // 2) If inserted, process
    // 3) Mark processed/failed
    const processed = await db.transaction(async (trx) => {
      await trx.raw(`set local statement_timeout = '8000ms'`);
      await trx.raw(`set local lock_timeout = '2000ms'`);

      const insertRes = await trx("billing_events")
        .insert({
          stripe_event_id: event.id,
          event_type: event.type,
          livemode: Boolean(event.livemode),
          stripe_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
          status: "received",
          payload: {
            // store safe subset; full event is ok if you want, but keep it manageable
            id: event.id,
            type: event.type,
            created: event.created,
            livemode: event.livemode,
            data: event.data, // JSONB
            request: (event as any).request ?? null,
          },
        })
        .onConflict("stripe_event_id")
        .ignore();

      // If insert did nothing -> duplicate
      if (Array.isArray(insertRes) ? insertRes.length === 0 : (insertRes as unknown as { rowCount?: number })?.rowCount === 0) {
        return { duplicate: true };
      }

      try {
        switch (event.type) {
          case "invoice.paid":
            await onInvoicePaid(trx, event);
            break;
          case "invoice.payment_failed":
            await onInvoicePaymentFailed(trx, event);
            break;
          case "customer.subscription.updated":
            await onSubscriptionUpdated(trx, event);
            break;
          case "customer.subscription.deleted":
            await onSubscriptionDeleted(trx, event);
            break;
          default:
            // Mark as skipped for observability
            await trx("billing_events")
              .where({ stripe_event_id: event.id })
              .update({ status: "skipped", processed_at: trx.fn.now() });
            return { duplicate: false, skipped: true };
        }

        await trx("billing_events")
          .where({ stripe_event_id: event.id })
          .update({ status: "processed", processed_at: trx.fn.now() });

        return { duplicate: false };
      } catch (err: any) {
        await trx("billing_events")
          .where({ stripe_event_id: event.id })
          .update({
            status: "failed",
            error: String(err?.message || err).slice(0, 2000),
            processed_at: trx.fn.now(),
          });
        throw err;
      }
    });

    if (processed?.duplicate) {
      res.json({ received: true, duplicate: true });
      return;
    }

    res.json({ received: true });
  } catch (_err: any) {
    // Return 500 so Stripe retries (unless you want to swallow certain errors)
    res.status(500).json({ error: "Internal processing error" });
  }
}

// ── Event handlers (transaction-scoped) ────────────────────────────────

async function onInvoicePaid(trx: any, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;

  const stripeSubId = (invoice as any).subscription as string | null;
  if (!stripeSubId) return;

  // Determine billing windows (your business logic)
  const nextBilling = nextFridayNoon();
  const periodEnd = periodEndForBillingDate(nextBilling);

  // Update subscription record
  await trx("subscriptions")
    .where({ stripe_subscription_id: stripeSubId })
    .update({
      status: "active",
      stripe_status: "active", // or invoice/ subscription lookup if you store it
      next_billing_date: nextBilling.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: trx.fn.now(),
    });

  // Apply pending changes ONLY for this subscription (not global)
  await applyPendingChangesForSubscription(trx, stripeSubId);
}

async function onInvoicePaymentFailed(trx: any, event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = (invoice as any).subscription as string | null;
  if (!stripeSubId) return;

  await trx("subscriptions")
    .where({ stripe_subscription_id: stripeSubId })
    .update({ status: "past_due", stripe_status: "past_due", updated_at: trx.fn.now() });

  // OPTIONAL: enqueue notification job (recommended) rather than sending inside webhook.
}

async function onSubscriptionUpdated(trx: any, event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;

  await trx("subscriptions")
    .where({ stripe_subscription_id: sub.id })
    .update({
      stripe_status: sub.status,
      status: mapStripeStatusToInternal(sub.status),
      updated_at: trx.fn.now(),
    });
}

async function onSubscriptionDeleted(trx: any, event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;

  await trx("subscriptions")
    .where({ stripe_subscription_id: sub.id })
    .update({ status: "canceled", stripe_status: "canceled", updated_at: trx.fn.now() });
}

function mapStripeStatusToInternal(stripeStatus: Stripe.Subscription.Status): string {
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
