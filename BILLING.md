# Overnight – Weekly Stripe Billing

## Architecture

All billing logic lives in the Next.js + Supabase stack:

- **Stripe client**: `src/lib/stripe.ts` — single Stripe instance, billing helpers
- **Checkout**: `src/app/api/stripe/route.ts` — creates Stripe Checkout Sessions
- **Webhooks**: `src/app/api/stripe/webhook/route.ts` — processes all Stripe events
- **Booking guard**: `src/app/api/bookings/route.ts` — checks active subscription before reserving
- **Schema**: `supabase-schema.sql` — `billing_events`, `pending_plan_changes` tables

## Plan Tiers

| Nights/Week | Price/Week |
|-------------|------------|
| 1           | $95        |
| 2           | $180       |
| 3           | $255       |
| 4           | $320       |
| 5           | $375       |

Prices are defined once in `src/lib/constants.ts` (`DEFAULT_PRICING_TIERS`).
The server always looks up the price by `nightsPerWeek` — the client never supplies a price.

## Billing Cycle

- **Interval**: Weekly (`recurring.interval = "week"`).
- **Anchor**: Friday at noon UTC via `billing_cycle_anchor`.
- **Charge timing**: Advance billing — parents pay Friday for the upcoming week (Friday → Thursday).
- **Period end**: Thursday 23:59:59 UTC.

## Mid-Cycle Plan Changes

**Policy: Apply at next billing week (no proration).**

When a parent changes their plan tier mid-cycle:
1. The change is queued in the `pending_plan_changes` Supabase table.
2. The parent retains their current tier for the rest of the paid week.
3. On the next Friday, when `invoice.paid` fires, queued changes are applied:
   - The Stripe subscription item is swapped to the new price.
   - The local `plans` row is updated with the new nights and price.

## Cancellation

- `cancel_at_period_end = true` — the parent keeps access until Thursday 23:59.
- Stripe fires `customer.subscription.deleted` at period end.
- Local plan status transitions to `cancelled`.
- Reservations are blocked once status is no longer `active`.

## Webhooks

| Event                            | Action                                                        |
|----------------------------------|---------------------------------------------------------------|
| `checkout.session.completed`     | Link Stripe subscription ID to plan, record initial payment   |
| `invoice.paid`                   | Mark active, record payment, apply pending plan changes       |
| `invoice.payment_failed`         | Mark `paused` → locks scheduling, record failed payment       |
| `customer.subscription.updated`  | Sync status from Stripe (catches retry-success, etc.)         |
| `customer.subscription.deleted`  | Mark `cancelled`                                              |

All events are deduplicated via `billing_events.stripe_event_id` (unique constraint).

## System Rules

1. **No active subscription = cannot reserve nights.**
   Enforced in `POST /api/bookings` — queries `plans` for `status = 'active'` before creating reservations.
2. **Payment failed = locked.**
   `paused` status fails the subscription check → scheduling blocked.
3. **Resolving payment** (card update + Stripe retry succeeds) fires `customer.subscription.updated` → status returns to `active` → scheduling unlocked.

## Database Tables (Supabase)

- `profiles` — user data, `stripe_customer_id`
- `plans` — links parent+child to Stripe subscription; stores nights, price, status
- `payments` — immutable payment history (succeeded, failed, refunded, comped)
- `billing_events` — immutable webhook audit trail with idempotency key
- `pending_plan_changes` — queued tier changes awaiting next billing cycle

## API Endpoints

| Method | Path                       | Description                        |
|--------|----------------------------|------------------------------------|
| POST   | `/api/stripe`              | Create Stripe Checkout Session     |
| POST   | `/api/stripe/webhook`      | Stripe webhook receiver            |
| GET    | `/api/bookings`            | List parent's plans & reservations |
| POST   | `/api/bookings`            | Create plan + reservations         |
| DELETE | `/api/bookings?id=...`     | Cancel a reservation               |

## Setup

1. Apply `supabase-schema.sql` to your Supabase project.
2. Set environment variables (see `.env.example`).
3. Run `npm run dev` to start the server.
4. Configure Stripe webhook endpoint to `https://your-domain/api/stripe/webhook`.
5. Required webhook events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
6. For local development, forward webhooks with the Stripe CLI:
   ```
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
