import Stripe from "stripe";
import { getStripe } from "./stripe-client";
import { getDb } from "../db/connection";
import { applyPendingChanges, nextFridayNoon, periodEndForBillingDate } from "./subscription-service";
import type { Request, Response } from "express";

/**
 * Verify and parse a Stripe webhook event.
 * Requires the raw body (Buffer) — Express must NOT parse JSON on this route.
 */
export function constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Main webhook handler. Dispatches to per-event-type processors.
 */
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
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // Idempotency: skip already-processed events.
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM billing_events WHERE stripe_event_id = ?")
    .get(event.id);
  if (existing) {
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    switch (event.type) {
      case "invoice.paid":
        await onInvoicePaid(event);
        break;
      case "invoice.payment_failed":
        await onInvoicePaymentFailed(event);
        break;
      case "customer.subscription.updated":
        await onSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event);
        break;
      default:
        // Acknowledge but ignore unhandled event types.
        break;
    }

    // Record event for idempotency and auditing.
    const subId = extractLocalSubscriptionId(event);
    db.prepare(
      `INSERT INTO billing_events (stripe_event_id, event_type, subscription_id, payload)
       VALUES (?, ?, ?, ?)`
    ).run(event.id, event.type, subId, JSON.stringify(event.data.object));

    res.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook processing error [${event.type}]:`, err);
    res.status(500).json({ error: "Internal processing error" });
  }
}

// ── Event handlers ──────────────────────────────────────────────────────

/**
 * invoice.paid — subscription payment succeeded.
 *
 * Actions:
 *   - Mark subscription active.
 *   - Update next_billing_date and current_period_end.
 *   - Apply any pending plan changes (tier swap at cycle boundary).
 */
async function onInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = (invoice as unknown as Record<string, unknown>).subscription as string | null;
  if (!stripeSubId) return; // one-off invoice, not subscription-related

  const db = getDb();
  const nextBilling = nextFridayNoon();
  const periodEnd = periodEndForBillingDate(nextBilling);

  db.prepare(
    `UPDATE subscriptions
     SET status = 'active',
         next_billing_date = ?,
         current_period_end = ?,
         updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  ).run(nextBilling.toISOString(), periodEnd.toISOString(), stripeSubId);

  // Apply queued tier changes now that the new cycle has started.
  await applyPendingChanges();
}

/**
 * invoice.payment_failed — charge was declined.
 *
 * Actions:
 *   - Mark subscription past_due. This locks scheduling via canReserve().
 *   - Stripe will retry per its Smart Retries settings.
 */
async function onInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = (invoice as unknown as Record<string, unknown>).subscription as string | null;
  if (!stripeSubId) return;

  const db = getDb();
  db.prepare(
    `UPDATE subscriptions
     SET status = 'past_due', updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  ).run(stripeSubId);

  // TODO: send parent a "payment failed, update your card" notification.
  console.warn(`Payment failed for subscription ${stripeSubId}`);
}

/**
 * customer.subscription.updated — plan change, status transition, etc.
 *
 * We primarily use this to catch Stripe-side status changes we didn't
 * initiate (e.g. Stripe marking a sub active after retry succeeds).
 */
async function onSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const db = getDb();

  const status = mapStripeStatus(sub.status);
  db.prepare(
    `UPDATE subscriptions
     SET status = ?, updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  ).run(status, sub.id);
}

/**
 * customer.subscription.deleted — subscription fully canceled.
 *
 * Reservations stop after the paid period already ended (cancel_at_period_end
 * was set in our cancel flow, so this fires at period end).
 */
async function onSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const sub = event.data.object as Stripe.Subscription;
  const db = getDb();

  db.prepare(
    `UPDATE subscriptions
     SET status = 'canceled', updated_at = datetime('now')
     WHERE stripe_subscription_id = ?`
  ).run(sub.id);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    default:
      return "incomplete";
  }
}

function extractLocalSubscriptionId(event: Stripe.Event): number | null {
  const obj = event.data.object as any;
  const stripeSubId = obj.subscription ?? obj.id;
  if (!stripeSubId) return null;

  const db = getDb();
  const row = db
    .prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = ?")
    .get(stripeSubId) as { id: number } | undefined;
  return row?.id ?? null;
}
