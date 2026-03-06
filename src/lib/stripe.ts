import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  throw new Error('Missing required environment variable: STRIPE_SECRET_KEY');
}

// Safety: prevent live keys in non-production environments
if (process.env.NODE_ENV !== 'production' && stripeKey.startsWith('sk_live_')) {
  throw new Error('Live Stripe key detected in non-production environment. Use sk_test_ keys for development.');
}

export const stripe = new Stripe(stripeKey, {
  apiVersion: '2026-02-25.clover',
});

/**
 * Get or create a Stripe customer for a parent.
 */
export async function getOrCreateCustomer(
  email: string,
  name: string,
  existingCustomerId?: string | null
): Promise<string> {
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name,
  });

  return customer.id;
}

/**
 * Create a weekly Stripe subscription for a plan.
 * Uses a price created dynamically based on the plan tier.
 */
export async function createWeeklySubscription(
  customerId: string,
  priceCents: number,
  metadata: Record<string, string>
): Promise<Stripe.Subscription> {
  // Create an ad-hoc price for the weekly amount
  const price = await stripe.prices.create({
    unit_amount: priceCents,
    currency: 'usd',
    recurring: { interval: 'week', interval_count: 1 },
    product_data: {
      name: `DreamWatch Overnight - Weekly Plan`,
    },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: price.id }],
    metadata,
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });

  return subscription;
}

/**
 * Cancel a Stripe subscription.
 */
export async function cancelSubscription(subscriptionId: string) {
  return stripe.subscriptions.cancel(subscriptionId);
}
