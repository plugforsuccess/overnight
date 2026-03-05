# Overnight – Weekly Stripe Billing

## Plan Tiers

| Tier      | Nights/Week | Price/Week |
|-----------|-------------|------------|
| `plan_1n` | 1           | $95        |
| `plan_2n` | 2           | $180       |
| `plan_3n` | 3           | $255       |
| `plan_4n` | 4           | $320       |
| `plan_5n` | 5           | $375       |

## Billing Cycle

- **Interval**: Weekly (Stripe `recurring.interval = "week"`).
- **Anchor**: Friday at noon UTC. All subscriptions are pinned via `billing_cycle_anchor` so invoices generate on Fridays.
- **Charge timing**: Advance billing — parents pay Friday for the upcoming week (Friday → Thursday).
- **Period end**: Thursday 23:59:59 UTC.

## Mid-Cycle Plan Changes

**Policy: Apply at next billing week (no proration).**

When a parent changes their plan tier mid-cycle:
1. The change is queued in the `pending_plan_changes` table.
2. The parent retains their current tier and night allocation for the rest of the paid week.
3. On the next Friday, when `invoice.paid` fires, queued changes are applied:
   - The Stripe subscription item is swapped to the new price.
   - The parent is billed the new amount for the upcoming week.

This avoids proration complexity and mid-week scheduling confusion.

## Cancellation

- `cancel_at_period_end = true` — the parent keeps access until Thursday 23:59.
- Stripe fires `customer.subscription.deleted` at period end.
- Local status transitions to `canceled`.
- Reservations are blocked once status is no longer `active`.

## Webhooks

| Event                            | Action                                                        |
|----------------------------------|---------------------------------------------------------------|
| `invoice.paid`                   | Mark active, update billing dates, apply pending plan changes  |
| `invoice.payment_failed`         | Mark `past_due` → locks scheduling                            |
| `customer.subscription.updated`  | Sync status from Stripe (catches retry-success, etc.)         |
| `customer.subscription.deleted`  | Mark `canceled`                                               |

All events are deduplicated via `billing_events.stripe_event_id`.

## System Rules

1. **No active subscription = cannot reserve nights.** Enforced by `requireActiveSubscription` middleware.
2. **Payment failed = locked.** `past_due` status is not `active`, so `canReserve()` returns false.
3. **Resolving payment** (card update + Stripe retry succeeds) fires `invoice.paid` → status returns to `active` → scheduling unlocked.

## Database Tables

- `parents` — ID, email, name, `stripe_customer_id`.
- `subscriptions` — links parent to Stripe subscription; stores tier, status, billing dates.
- `billing_events` — immutable audit log of processed webhook events.
- `pending_plan_changes` — queued tier changes awaiting the next billing cycle.

## API Endpoints

| Method | Path                          | Description                     |
|--------|-------------------------------|---------------------------------|
| GET    | `/api/billing/plans`          | List available plan tiers       |
| POST   | `/api/billing/subscribe`      | Create a new subscription       |
| POST   | `/api/billing/change-plan`    | Queue a mid-cycle plan change   |
| POST   | `/api/billing/cancel`         | Cancel at period end            |
| GET    | `/api/billing/status/:parentId` | Get subscription status       |
| POST   | `/api/billing/webhook`        | Stripe webhook receiver         |

## Setup

1. Set environment variables (see `.env.example`).
2. Run `npm run migrate` to initialize the database.
3. Run `npm run dev` to start the server.
4. Call the Stripe CLI to forward webhooks locally:
   ```
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```
5. On first startup, call `ensureStripePlans()` to create Stripe Products/Prices (or add to a setup script).
