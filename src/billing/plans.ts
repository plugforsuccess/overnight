import { getStripe } from "./stripe-client";
import { PlanTier, PLAN_PRICES, PLAN_LABELS } from "../types/billing";

/**
 * Ensures a Stripe Product + Price exist for each plan tier.
 *
 * Stripe prices are immutable, so we create them once and cache the
 * price IDs in a lookup table. Call this at startup or as a one-time
 * migration step.
 *
 * Returns a map of PlanTier → Stripe Price ID.
 */
export async function ensureStripePlans(): Promise<Record<PlanTier, string>> {
  const stripe = getStripe();
  const priceMap: Partial<Record<PlanTier, string>> = {};

  for (const tier of Object.values(PlanTier)) {
    const productName = `Overnight – ${PLAN_LABELS[tier]}`;
    const lookup = `overnight_${tier}`;

    // Try to find an existing price by lookup_key.
    const existing = await stripe.prices.list({
      lookup_keys: [lookup],
      limit: 1,
    });

    if (existing.data.length > 0) {
      priceMap[tier] = existing.data[0].id;
      continue;
    }

    // Create product + price.
    const product = await stripe.products.create({
      name: productName,
      metadata: { tier },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: PLAN_PRICES[tier],
      currency: "usd",
      recurring: {
        interval: "week",
        interval_count: 1,
      },
      lookup_key: lookup,
      metadata: { tier },
    });

    priceMap[tier] = price.id;
  }

  return priceMap as Record<PlanTier, string>;
}

/** Resolve a single tier's Stripe Price ID. */
export async function getPriceId(tier: PlanTier): Promise<string> {
  const stripe = getStripe();
  const lookup = `overnight_${tier}`;
  const result = await stripe.prices.list({ lookup_keys: [lookup], limit: 1 });
  if (result.data.length === 0) {
    throw new Error(`No Stripe price found for tier ${tier}. Run plan setup first.`);
  }
  return result.data[0].id;
}
