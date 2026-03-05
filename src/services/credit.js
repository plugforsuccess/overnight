const crypto = require('crypto');
const db = require('../db');

// Plan pricing in cents (matches PRD)
const PLAN_PRICES = {
  3: 30000, // $300
  4: 36000, // $360
  5: 42500, // $425
};

/**
 * Calculate credit amount for a canceled night based on the plan.
 * Credit = weekly_plan_price / nights_in_plan
 */
function getCreditAmount(nightsPerWeek) {
  const price = PLAN_PRICES[nightsPerWeek];
  if (!price) return 0;
  return Math.round(price / nightsPerWeek);
}

/**
 * Issue a credit to a parent for a canceled night.
 */
async function issueCredit({ parentId, amountCents, reason, relatedBlockId, relatedDate }) {
  const credit = {
    id: crypto.randomUUID(),
    parent_id: parentId,
    amount_cents: amountCents,
    reason,
    related_block_id: relatedBlockId || null,
    related_date: relatedDate || null,
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
  return result.total || 0;
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
 * Returns total amount applied in cents.
 */
async function applyCredits(parentId) {
  const unapplied = await db('credits')
    .where({ parent_id: parentId, applied: false });

  if (unapplied.length === 0) return 0;

  const total = unapplied.reduce((sum, c) => sum + c.amount_cents, 0);
  const ids = unapplied.map(c => c.id);
  const now = new Date().toISOString();

  await db('credits')
    .whereIn('id', ids)
    .update({ applied: true, applied_at: now });

  return total;
}

module.exports = {
  getCreditAmount,
  issueCredit,
  getCreditBalance,
  getCredits,
  applyCredits,
  PLAN_PRICES,
};
