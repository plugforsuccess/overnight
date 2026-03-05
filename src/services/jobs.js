const db = require('../db');
const enrollmentService = require('./enrollment');
const waitlistService = require('./waitlist');
const creditService = require('./credit');
const capacityService = require('./capacity');
const reservationService = require('./reservation');
const notifications = require('./notifications');

/**
 * Weekly Billing Job — Runs Friday 12:00 PM
 *
 * Responsibilities:
 * - Process billing for the upcoming week (Stripe integration)
 * - Lock unpaid reservations
 * - Apply credits to billing
 */
async function runWeeklyBilling(weekStart) {
  const dates = reservationService.getWeekDates(weekStart);
  const results = { processed: 0, locked: 0, creditsApplied: 0 };

  // Get all active blocks for this week
  const blocks = await db('overnight_blocks')
    .where({ week_start: weekStart, status: 'active' });

  for (const block of blocks) {
    // Check if payment is confirmed
    if (block.payment_status === 'confirmed') {
      // Update all reservations to confirmed
      await db('reservations')
        .where({ overnight_block_id: block.id, status: 'pending_payment' })
        .update({ status: 'confirmed' });
      results.processed++;
    } else if (block.payment_status === 'pending' || block.payment_status === 'locked') {
      // Lock reservations until payment is resolved
      await db('reservations')
        .where({ overnight_block_id: block.id })
        .update({ status: 'locked' });
      await db('overnight_blocks')
        .where({ id: block.id })
        .update({ payment_status: 'locked' });

      const parent = await db('parents').where({ id: block.parent_id }).first();
      if (parent) {
        await notifications.notifyPaymentFailed(parent);
      }
      results.locked++;
    }

    // Apply any outstanding credits
    const creditsApplied = await creditService.applyCredits(block.parent_id);
    if (creditsApplied > 0) {
      results.creditsApplied += creditsApplied;
    }
  }

  return results;
}

/**
 * Enrollment Cutoff Job — Runs Friday 1:00 PM
 *
 * Responsibilities:
 * - Check enrollment for each night of the upcoming week
 * - Cancel under-enrolled nights (< 4 children)
 * - Issue credits for canceled nights
 * - Notify parents
 */
async function runEnrollmentCutoff(weekStart) {
  return enrollmentService.enforceWeek(weekStart);
}

/**
 * Waitlist Promotion Job — Runs every 5 minutes
 *
 * Responsibilities:
 * - Expire stale offers
 * - Detect open capacity on upcoming nights
 * - Promote next waitlist entry for each night with open spots
 */
async function runWaitlistPromotion() {
  // Expire stale offers first
  await waitlistService.expireOffers();

  // Find dates with waiting entries
  const waitingDates = await db('waitlist')
    .where({ status: 'waiting' })
    .distinct('date')
    .select('date');

  const results = [];

  for (const { date } of waitingDates) {
    // Check if there's no active offer for this date
    const activeOffer = await db('waitlist')
      .where({ date, status: 'offered' })
      .first();

    if (activeOffer) continue; // Already an active offer

    // Check if the night is canceled
    const night = await db('nightly_capacity').where({ date }).first();
    if (night && night.status !== 'open') continue;

    // Check capacity
    const hasRoom = await capacityService.hasCapacity(date);
    if (!hasRoom) continue;

    // Offer to next in line
    const offered = await waitlistService.offerNextInLine(date);
    if (offered) {
      results.push({ date, offeredTo: offered.child_id });
    }
  }

  return results;
}

module.exports = {
  runWeeklyBilling,
  runEnrollmentCutoff,
  runWaitlistPromotion,
};
