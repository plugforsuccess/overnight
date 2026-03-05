const crypto = require('crypto');
const db = require('../db');

// Plan pricing in cents (matches PRD) — used as fallback only.
// Prefer getCreditAmountFromSnapshot() which uses the block's pricing snapshot.
const PLAN_PRICES = {
  3: 30000, // $300
  4: 36000, // $360
  5: 42500, // $425
};

/**
 * Calculate credit from hardcoded plan prices (fallback).
 * Prefer getCreditAmountFromSnapshot() for accuracy.
 */
function getCreditAmount(nightsPerWeek) {
  const price = PLAN_PRICES[nightsPerWeek];
  if (!price) return 0;
  return Math.round(price / nightsPerWeek);
}

/**
 * Calculate credit from the block's pricing snapshot.
 * This ensures credits reflect the price the parent actually paid,
 * even if plan pricing has changed since.
 */
function getCreditAmountFromSnapshot(weeklyPriceCents, nightsPerWeek) {
  if (!weeklyPriceCents || !nightsPerWeek) return 0;
  return Math.round(weeklyPriceCents / nightsPerWeek);
}

/**
 * Issue a credit to a parent for a canceled night.
 */
async function issueCredit({ parentId, amountCents, reason, relatedBlockId, relatedDate, sourceWeeklyPriceCents, sourcePlanNights }) {
  const credit = {
    id: crypto.randomUUID(),
    parent_id: parentId,
    amount_cents: amountCents,
    reason,
    related_block_id: relatedBlockId || null,
    related_date: relatedDate || null,
    source_weekly_price_cents: sourceWeeklyPriceCents || null,
    source_plan_nights: sourcePlanNights || null,
    applied: false,
  };
  await db('credits').insert(credit);
  return credit;
}

/**
 * Get total unapplied credit balance for a parent (in cents).
 */
async function getCreditBalance(parentId) {
  const result = await db('credits')
    .where({ parent_id: parentId, applied: false })
    .sum('amount_cents as total')
    .first();
  return Number(result.total) || 0;
}

/**
 * Get all credits for a parent.
 */
async function getCredits(parentId) {
  return db('credits')
    .where({ parent_id: parentId })
    .orderBy('created_at', 'desc');
}

/**
 * Apply credits to a billing cycle. Marks credits as applied.
 * HARDENED: uses transaction + FOR UPDATE to prevent double-application.
 * Returns total amount applied in cents.
 */
async function applyCredits(parentId) {
  return db.transaction(async (trx) => {
    const unapplied = await trx('credits')
      .where({ parent_id: parentId, applied: false })
      .forUpdate();

    if (unapplied.length === 0) return 0;

    const total = unapplied.reduce((sum, c) => sum + c.amount_cents, 0);
    const ids = unapplied.map(c => c.id);

    await trx('credits')
      .whereIn('id', ids)
      .update({ applied: true, applied_at: trx.fn.now() });

    return total;
  });
}

module.exports = {
  getCreditAmount,
  getCreditAmountFromSnapshot,
  issueCredit,
  getCreditBalance,
  getCredits,
  applyCredits,
  PLAN_PRICES,
};
