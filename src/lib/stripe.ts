import Stripe from 'stripe';
import { DEFAULT_PRICING_TIERS } from '@/lib/constants';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

// ---------------------------------------------------------------------------
// Mid-cycle change policy: APPLY AT NEXT BILLING WEEK (no proration)
//
// When a parent changes their plan tier mid-cycle:
//   1. The change is queued in `pending_plan_changes`.
//   2. The parent keeps their current tier for the rest of the paid week.
//   3. On the next Friday billing run, the Stripe subscription is updated
//      to the new price and the parent is charged the new amount.
// ---------------------------------------------------------------------------

/**
 * Compute the next Friday at noon UTC from a given date.
 * If today is Friday before noon, returns today. Otherwise next Friday.
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

/**
 * Look up the correct price in cents for a given nights-per-week count.
 * Uses the canonical pricing from constants.ts.
 */
export function priceCentsForNights(nightsPerWeek: number): number {
  const tier = DEFAULT_PRICING_TIERS.find((t) => t.nights === nightsPerWeek);
  if (!tier) {
    throw new Error(`Invalid nights_per_week: ${nightsPerWeek}. Must be 1–5.`);
  }
  return tier.price_cents;
}

/**
 * Get or create a Stripe customer for a parent.
 */
export async function getOrCreateCustomer(
  email: string,
  name: string,
  parentId: string,
  existingCustomerId?: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { parent_id: parentId },
  });

  return customer.id;
}

/**
 * Ensure a Stripe Price exists for a given nights-per-week tier.
 * Uses lookup_key for idempotent price retrieval.
 */
async function ensurePrice(nightsPerWeek: number): Promise<string> {
  const lookup = `overnight_${nightsPerWeek}n`;
  const existing = await stripe.prices.list({ lookup_keys: [lookup], limit: 1 });
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  const cents = priceCentsForNights(nightsPerWeek);
  const price = await stripe.prices.create({
    unit_amount: cents,
    currency: 'usd',
    recurring: { interval: 'week', interval_count: 1 },
    product_data: {
      name: `DreamWatch Overnight – ${nightsPerWeek} Night${nightsPerWeek > 1 ? 's' : ''}/Week`,
    },
    lookup_key: lookup,
    metadata: { nights_per_week: String(nightsPerWeek) },
  });

  return price.id;
}

/**
 * Create a weekly subscription with billing anchored to Friday noon UTC.
 *
 * Price is determined server-side from nightsPerWeek — never from the client.
 */
export async function createWeeklySubscription(
  customerId: string,
  nightsPerWeek: number,
  metadata: Record<string, string>
): Promise<Stripe.Subscription> {
  const priceId = await ensurePrice(nightsPerWeek);

  const anchor = nextFridayNoon();
  const anchorUnix = Math.floor(anchor.getTime() / 1000);

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    billing_cycle_anchor: anchorUnix,
    proration_behavior: 'create_prorations',
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payment_intent'],
    metadata,
  });

  return subscription;
}

/**
 * Update a subscription to a new tier. Used when applying pending plan changes
 * at the billing cycle boundary.
 */
export async function updateSubscriptionTier(
  subscriptionId: string,
  newNightsPerWeek: number
): Promise<void> {
  const priceId = await ensurePrice(newNightsPerWeek);
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = sub.items.data[0].id;

  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: 'none', // already at cycle boundary
    metadata: { nights_per_week: String(newNightsPerWeek) },
  });
}

/**
 * Cancel a subscription at the end of the current billing period.
 * Reservations remain valid through the paid week.
 */
export async function cancelSubscription(subscriptionId: string) {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Map a Stripe subscription status to our local plan status.
 */
export function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): 'active' | 'paused' | 'cancelled' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'incomplete':
    case 'incomplete_expired':
      return 'paused';
    case 'canceled':
    case 'unpaid':
      return 'cancelled';
    default:
      return 'paused';
  }
}
