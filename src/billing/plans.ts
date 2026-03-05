import { getStripe } from "./stripe-client";
import { PlanTier, PLAN_PRICES, PLAN_LABELS } from "../types/billing";

/** Environment-aware prefix for Stripe lookup keys (avoids collisions across apps/envs). */
const LOOKUP_PREFIX = process.env.STRIPE_LOOKUP_PREFIX || "overnight";

function lookupKey(tier: PlanTier): string {
  return `${LOOKUP_PREFIX}_${tier}`;
}

// ---------------------------------------------------------------------------
// In-process price cache (populated from DB, falls back to Stripe)
// ---------------------------------------------------------------------------

let priceCache: Record<string, string> | null = null;

/** Read all cached prices from the stripe_prices DB table. */
async function loadPriceCacheFromDb(db: import("knex").Knex): Promise<Record<string, string>> {
  const mode = LOOKUP_PREFIX.includes("live") ? "live" : "test";
  const rows: Array<{ tier: string; price_id: string }> = await db("stripe_prices")
    .where({ mode })
    .select("tier", "price_id");

  const map: Record<string, string> = {};
  for (const r of rows) map[r.tier] = r.price_id;
  return map;
}

/** Persist a price ID to the DB cache. */
async function savePriceToDb(
  db: import("knex").Knex,
  tier: PlanTier,
  priceId: string
): Promise<void> {
  const mode = LOOKUP_PREFIX.includes("live") ? "live" : "test";
  await db("stripe_prices")
    .insert({ tier, price_id: priceId, mode, updated_at: db.fn.now() })
    .onConflict(["tier", "mode"])
    .merge({ price_id: priceId, updated_at: db.fn.now() });
}

// ---------------------------------------------------------------------------
// ensureStripePlans — protected by a Postgres advisory lock
// ---------------------------------------------------------------------------

/** Stable advisory-lock ID (arbitrary but unique within the app). */
const ADVISORY_LOCK_ID = 839201;

/**
 * Ensures a Stripe Product + Price exist for each plan tier.
 *
 * Protected by a Postgres advisory lock so concurrent server boots don't
 * create duplicate products/prices.
 *
 * Populates the `stripe_prices` DB table so that `getPriceId()` can read
 * from the DB instead of hitting Stripe on every request.
 */
export async function ensureStripePlans(
  db: import("knex").Knex
): Promise<Record<PlanTier, string>> {
  const stripe = getStripe();
  const priceMap: Partial<Record<PlanTier, string>> = {};

  // Acquire advisory lock (session-level, released at end of block).
  const lockAcquired = await db.raw<{ rows: Array<{ pg_try_advisory_lock: boolean }> }>(
    `SELECT pg_try_advisory_lock(?)`,
    [ADVISORY_LOCK_ID]
  );
  const gotLock = lockAcquired.rows?.[0]?.pg_try_advisory_lock;

  if (!gotLock) {
    // Another instance is running setup — load from DB instead.
    const cached = await loadPriceCacheFromDb(db);
    if (Object.keys(cached).length === Object.values(PlanTier).length) {
      return cached as Record<PlanTier, string>;
    }
    throw new Error(
      "ensureStripePlans: could not acquire advisory lock and DB cache is incomplete. Retry later."
    );
  }

  try {
    for (const tier of Object.values(PlanTier)) {
      const lookup = lookupKey(tier);
      const productName = `Overnight – ${PLAN_LABELS[tier]}`;

      // 1. Try to find an existing price by lookup_key.
      const existing = await stripe.prices.list({
        lookup_keys: [lookup],
        limit: 1,
      });

      if (existing.data.length > 0) {
        priceMap[tier] = existing.data[0].id;
        await savePriceToDb(db, tier, existing.data[0].id);
        continue;
      }

      // 2. Reuse an existing product for this tier (avoid duplicate products).
      let productId: string | undefined;
      const products = await stripe.products.search({
        query: `metadata["tier"]:"${tier}"`,
        limit: 1,
      });
      if (products.data.length > 0) {
        productId = products.data[0].id;
      } else {
        const product = await stripe.products.create({
          name: productName,
          metadata: { tier },
        });
        productId = product.id;
      }

      // 3. Create price.
      const price = await stripe.prices.create({
        product: productId,
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
      await savePriceToDb(db, tier, price.id);
    }
  } finally {
    // Release advisory lock.
    await db.raw(`SELECT pg_advisory_unlock(?)`, [ADVISORY_LOCK_ID]);
  }

  priceCache = { ...(priceCache || {}), ...priceMap };
  return priceMap as Record<PlanTier, string>;
}

// ---------------------------------------------------------------------------
// getPriceId — reads from DB cache, only hits Stripe if missing
// ---------------------------------------------------------------------------

/**
 * Resolve a single tier's Stripe Price ID.
 *
 * Reads from the in-memory cache first, then the `stripe_prices` DB table,
 * and only falls back to Stripe API if neither has the value.
 */
export async function getPriceId(
  tier: PlanTier,
  db: import("knex").Knex
): Promise<string> {
  // 1. In-memory cache.
  if (priceCache?.[tier]) return priceCache[tier];

  // 2. DB cache.
  const mode = LOOKUP_PREFIX.includes("live") ? "live" : "test";
  const row = await db("stripe_prices")
    .where({ tier, mode })
    .first<{ price_id: string } | undefined>("price_id");

  if (row?.price_id) {
    priceCache = { ...(priceCache || {}), [tier]: row.price_id };
    return row.price_id;
  }

  // 3. Stripe fallback (one-time, caches result).
  const stripe = getStripe();
  const lookup = lookupKey(tier);
  const result = await stripe.prices.list({ lookup_keys: [lookup], limit: 1 });
  if (result.data.length === 0) {
    throw new Error(`No Stripe price found for tier ${tier}. Run ensureStripePlans() first.`);
  }

  const priceId = result.data[0].id;
  await savePriceToDb(db, tier, priceId);
  priceCache = { ...(priceCache || {}), [tier]: priceId };
  return priceId;
}
