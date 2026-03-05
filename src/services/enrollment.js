const db = require('../db');
const configService = require('./config');
const creditService = require('./credit');
const notifications = require('./notifications');
const reservationService = require('./reservation');

/**
 * Check enrollment for a specific night and cancel if below minimum.
 * Called as part of the Friday 1PM enrollment cutoff job.
 *
 * Returns { canceled: boolean, date, count, minimum }
 */
async function enforceMinimumEnrollment(date) {
  const minimum = (await configService.getInt('min_enrollment_per_night')) || 4;

  // Count confirmed reservations for this date
  const result = await db('reservations')
    .where({ date })
    .whereNot({ status: 'canceled_low_enrollment' })
    .count('* as count')
    .first();
  const count = result.count;

  if (count >= minimum) {
    return { canceled: false, date, count, minimum };
  }

  // Night is under-enrolled — cancel all reservations
  const reservations = await db('reservations')
    .where({ date })
    .whereNot({ status: 'canceled_low_enrollment' });

  for (const res of reservations) {
    // Update reservation status
    await db('reservations')
      .where({ id: res.id })
      .update({ status: 'canceled_low_enrollment' });

    // Get the block to determine credit amount
    const block = await db('overnight_blocks')
      .where({ id: res.overnight_block_id })
      .first();

    if (block) {
      const creditAmount = creditService.getCreditAmount(block.nights_per_week);

      // Issue credit to the parent
      await creditService.issueCredit({
        parentId: block.parent_id,
        amountCents: creditAmount,
        reason: 'canceled_low_enrollment',
        relatedBlockId: block.id,
        relatedDate: date,
      });

      // Notify parent
      const parent = await db('parents').where({ id: block.parent_id }).first();
      const child = await db('children').where({ id: res.child_id }).first();
      if (parent && child) {
        await notifications.notifyNightCanceled(parent, child, date, creditAmount);
      }
    }
  }

  // Mark the night as canceled
  const existing = await db('nightly_status').where({ date }).first();
  if (existing) {
    await db('nightly_status').where({ date }).update({ status: 'canceled_low_enrollment' });
  } else {
    await db('nightly_status').insert({ date, status: 'canceled_low_enrollment' });
  }

  return { canceled: true, date, count, minimum, canceledReservations: reservations.length };
}

/**
 * Run enrollment enforcement for all nights in a given week.
 * weekStart is the Sunday date string (YYYY-MM-DD).
 */
async function enforceWeek(weekStart) {
  const dates = reservationService.getWeekDates(weekStart);
  const results = [];

  for (const date of dates) {
    const result = await enforceMinimumEnrollment(date);
    results.push(result);
  }

  return results;
}

/**
 * Get enrollment status for a date.
 */
async function getEnrollmentStatus(date) {
  const minimum = (await configService.getInt('min_enrollment_per_night')) || 4;
  const result = await db('reservations')
    .where({ date })
    .whereNot({ status: 'canceled_low_enrollment' })
    .count('* as count')
    .first();
  const count = result.count;

  const nightStatus = await db('nightly_status').where({ date }).first();

  return {
    date,
    enrolled: count,
    minimum,
    meetsMinimum: count >= minimum,
    status: nightStatus ? nightStatus.status : 'open',
  };
}

module.exports = {
  enforceMinimumEnrollment,
  enforceWeek,
  getEnrollmentStatus,
};
