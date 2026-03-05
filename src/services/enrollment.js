const db = require('../db');
const configService = require('./config');
const creditService = require('./credit');
const notifications = require('./notifications');
const reservationService = require('./reservation');

/**
 * Check enrollment for a specific night and cancel if below minimum.
 * Called as part of the Friday 1PM enrollment cutoff job.
 *
 * HARDENED:
 * - Uses transaction + advisory lock to prevent races
 * - Credits computed from the block's pricing snapshot (not hardcoded)
 * - Uses nightly_capacity table (fixed from nonexistent nightly_status)
 * - Notifications sent after commit to avoid notifying on rollback
 *
 * Returns { canceled: boolean, date, count, minimum }
 */
async function enforceMinimumEnrollment(date) {
  const minimum = (await configService.getInt('min_enrollment_per_night')) || 4;
  const notifyQueue = [];

  const result = await db.transaction(async (trx) => {
    // Lock the night row to prevent concurrent enrollment changes
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [date]);

    // Ensure nightly_capacity row exists
    await trx('nightly_capacity').insert({ date }).onConflict('date').ignore();

    await trx('nightly_capacity').where({ date }).forUpdate().first();

    // Count non-canceled reservations for this date
    const countResult = await trx('reservations')
      .where({ date })
      .whereNot({ status: 'canceled_low_enrollment' })
      .count('* as count')
      .first();
    const count = Number(countResult.count);

    if (count >= minimum) {
      return { canceled: false, date, count, minimum };
    }

    // Night is under-enrolled — cancel all non-canceled reservations
    const reservations = await trx('reservations')
      .where({ date })
      .whereNot({ status: 'canceled_low_enrollment' });

    for (const res of reservations) {
      await trx('reservations')
        .where({ id: res.id })
        .update({ status: 'canceled_low_enrollment', updated_at: trx.fn.now() });

      // Get block for pricing snapshot (credit = weekly_price / nights_per_week)
      const block = await trx('overnight_blocks')
        .where({ id: res.overnight_block_id })
        .first();

      if (block) {
        const creditAmount = creditService.getCreditAmountFromSnapshot(
          block.weekly_price_cents,
          block.nights_per_week
        );

        await trx('credits').insert({
          parent_id: block.parent_id,
          amount_cents: creditAmount,
          reason: 'canceled_low_enrollment',
          related_block_id: block.id,
          related_date: date,
          source_weekly_price_cents: block.weekly_price_cents,
          source_plan_nights: block.nights_per_week,
          applied: false,
        });

        // Queue notification (send after commit)
        const parent = await trx('parents').where({ id: block.parent_id }).first();
        const child = await trx('children').where({ id: res.child_id }).first();
        if (parent && child) {
          notifyQueue.push({ parent, child, date, creditAmount });
        }
      }
    }

    // Mark the night as canceled in nightly_capacity
    await trx('nightly_capacity')
      .where({ date })
      .update({ status: 'canceled_low_enrollment', confirmed_count: 0, updated_at: trx.fn.now() });

    return { canceled: true, date, count, minimum, canceledReservations: reservations.length };
  });

  // Send notifications after successful commit
  for (const n of notifyQueue) {
    await notifications.notifyNightCanceled(n.parent, n.child, n.date, n.creditAmount);
  }

  return result;
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
  const count = Number(result.count);

  const night = await db('nightly_capacity').where({ date }).first();

  return {
    date,
    enrolled: count,
    minimum,
    meetsMinimum: count >= minimum,
    status: night ? night.status : 'open',
  };
}

module.exports = {
  enforceMinimumEnrollment,
  enforceWeek,
  getEnrollmentStatus,
};
