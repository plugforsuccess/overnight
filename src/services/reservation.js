const crypto = require('crypto');
const db = require('../db');
const capacity = require('./capacity');
const waitlist = require('./waitlist');

const WEEK_NIGHTS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

/**
 * Returns true if the current Knex connection is PostgreSQL.
 */
function isPostgres() {
  const client = db.client?.config?.client;
  return client === 'pg' || client === 'postgresql';
}

function getWeekDates(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  return WEEK_NIGHTS.map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

/**
 * Transaction-safe reservation creation for PostgreSQL.
 * Uses row locks (SELECT ... FOR UPDATE) and advisory locks to prevent overselling.
 */
async function createReservationSafe({ childId, parentId, weekStart, nightsPerWeek, selectedDates }) {
  const weekDates = getWeekDates(weekStart);

  for (const date of selectedDates) {
    if (!weekDates.includes(date)) {
      return { error: `Date ${date} is not within the week starting ${weekStart}` };
    }
  }

  if (selectedDates.length !== nightsPerWeek) {
    return { error: `Must select exactly ${nightsPerWeek} nights, got ${selectedDates.length}` };
  }

  const dates = Array.from(new Set(selectedDates)).sort();

  try {
    return await db.transaction(async (trx) => {
      // Ensure nightly_capacity rows exist
      await trx('nightly_capacity')
        .insert(dates.map((date) => ({ date })))
        .onConflict('date')
        .ignore();

      // Lock rows in sorted order to prevent deadlocks
      for (const date of dates) {
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [date]);

        const night = await trx('nightly_capacity')
          .select('date', 'status', 'capacity', 'override_capacity', 'confirmed_count')
          .where({ date })
          .forUpdate()
          .first();

        if (!night) {
          throw Object.assign(new Error('Night capacity row missing'), { code: 'NIGHT_NOT_FOUND', date });
        }

        if (night.status !== 'open' && night.status !== 'full') {
          throw Object.assign(new Error(`Night ${date} is not bookable`), { code: 'NIGHT_CLOSED', date });
        }

        const effectiveCapacity = night.override_capacity ?? night.capacity;
        if (night.confirmed_count >= effectiveCapacity) {
          if (night.status !== 'full') {
            await trx('nightly_capacity').where({ date }).update({ status: 'full', updated_at: trx.fn.now() });
          }
          throw Object.assign(new Error(`Night ${date} is full`), {
            code: 'NIGHT_FULL',
            date,
            fullDates: [date],
          });
        }
      }

      // Create the overnight block
      const blockId = crypto.randomUUID();
      await trx('overnight_blocks').insert({
        id: blockId,
        week_start: weekStart,
        nights_per_week: nightsPerWeek,
        parent_id: parentId,
        child_id: childId,
        status: 'active',
      });

      // Insert reservations
      const reservations = dates.map((date) => ({
        id: crypto.randomUUID(),
        child_id: childId,
        date,
        overnight_block_id: blockId,
        status: 'confirmed',
        admin_override: false,
      }));

      try {
        await trx('reservations').insert(reservations);
      } catch (err) {
        if (err?.code === '23505') {
          throw Object.assign(new Error('Child already booked for one of the selected nights'), {
            code: 'DUPLICATE_BOOKING',
          });
        }
        throw err;
      }

      // Increment confirmed_count and auto-mark full
      for (const date of dates) {
        const updated = await trx('nightly_capacity')
          .where({ date })
          .update({
            confirmed_count: trx.raw('confirmed_count + 1'),
            updated_at: trx.fn.now(),
          })
          .returning(['date', 'capacity', 'override_capacity', 'confirmed_count', 'status']);

        const night = updated?.[0];
        if (night) {
          const effectiveCapacity = night.override_capacity ?? night.capacity;
          if (night.confirmed_count >= effectiveCapacity && night.status !== 'full') {
            await trx('nightly_capacity').where({ date }).update({ status: 'full', updated_at: trx.fn.now() });
          }
        }
      }

      // Audit log
      await trx('audit_log').insert({
        actor_id: parentId,
        action: 'reserve_nights',
        entity_type: 'overnight_blocks',
        entity_id: blockId,
        metadata: JSON.stringify({ child_id: childId, dates }),
        created_at: trx.fn.now(),
      });

      return { blockId, reservations };
    });
  } catch (err) {
    // Convert transaction errors to the return-value error format the rest of the app expects
    if (err.code === 'NIGHT_FULL') {
      return {
        error: 'Some dates are at full capacity',
        fullDates: err.fullDates || [err.date],
        suggestion: 'Use the waitlist endpoint to join the waitlist for full dates',
      };
    }
    if (err.code === 'DUPLICATE_BOOKING') {
      return { error: err.message };
    }
    throw err;
  }
}

/**
 * Original non-locking reservation creation (SQLite / legacy path).
 */
async function createReservationLegacy({ childId, parentId, weekStart, nightsPerWeek, selectedDates }) {
  const weekDates = getWeekDates(weekStart);

  // Validate selected dates are within the week
  for (const date of selectedDates) {
    if (!weekDates.includes(date)) {
      return { error: `Date ${date} is not within the week starting ${weekStart}` };
    }
  }

  // Validate nights count matches plan
  if (selectedDates.length !== nightsPerWeek) {
    return { error: `Must select exactly ${nightsPerWeek} nights, got ${selectedDates.length}` };
  }

  // Check for double booking
  const existing = await db('reservations')
    .where({ child_id: childId })
    .whereIn('date', selectedDates);
  if (existing.length > 0) {
    const dates = existing.map((r) => r.date).join(', ');
    return { error: `Child is already booked for: ${dates}` };
  }

  // Check capacity for each date
  const fullDates = [];
  for (const date of selectedDates) {
    const hasRoom = await capacity.hasCapacity(date);
    if (!hasRoom) fullDates.push(date);
  }
  if (fullDates.length > 0) {
    return {
      error: 'Some dates are at full capacity',
      fullDates,
      suggestion: 'Use the waitlist endpoint to join the waitlist for full dates',
    };
  }

  // Create the overnight block
  const blockId = crypto.randomUUID();
  await db('overnight_blocks').insert({
    id: blockId,
    week_start: weekStart,
    nights_per_week: nightsPerWeek,
    parent_id: parentId,
    child_id: childId,
    status: 'active',
  });

  // Create reservations
  const reservations = selectedDates.map((date) => ({
    id: crypto.randomUUID(),
    child_id: childId,
    date,
    overnight_block_id: blockId,
  }));
  await db('reservations').insert(reservations);

  return { blockId, reservations };
}

/**
 * Create a reservation — automatically uses the transaction-safe path on Postgres.
 */
async function createReservation(args) {
  if (isPostgres()) {
    return createReservationSafe(args);
  }
  return createReservationLegacy(args);
}

async function swapNights({ blockId, dropDate, addDate }) {
  const block = await db('overnight_blocks').where({ id: blockId, status: 'active' }).first();
  if (!block) return { error: 'Overnight block not found or not active' };

  const weekDates = getWeekDates(block.week_start);
  if (!weekDates.includes(addDate)) {
    return { error: `Date ${addDate} is not within this week` };
  }

  // Verify the drop reservation exists
  const dropRes = await db('reservations')
    .where({ overnight_block_id: blockId, date: dropDate })
    .first();
  if (!dropRes) return { error: `No reservation found for ${dropDate} in this block` };

  // Check child isn't already booked on the new date
  const existingOnNew = await db('reservations')
    .where({ child_id: block.child_id, date: addDate })
    .first();
  if (existingOnNew) return { error: `Child is already booked for ${addDate}` };

  // Check capacity on new date
  const hasRoom = await capacity.hasCapacity(addDate);
  if (!hasRoom) return { error: `No capacity available on ${addDate}` };

  // Perform the swap within a transaction
  await db.transaction(async (trx) => {
    await trx('reservations').where({ id: dropRes.id }).delete();
    await trx('reservations').insert({
      id: crypto.randomUUID(),
      child_id: block.child_id,
      date: addDate,
      overnight_block_id: blockId,
    });
  });

  // Offer the freed spot to waitlist
  await waitlist.offerNextInLine(dropDate);

  return { success: true, dropped: dropDate, added: addDate };
}

/**
 * Transaction-safe single-night cancellation for PostgreSQL.
 * Locks capacity row, decrements count, reopens if was full.
 */
async function cancelReservationSafe(reservationId) {
  const res = await db('reservations').where({ id: reservationId }).first();
  if (!res) return { error: 'Reservation not found' };

  await db.transaction(async (trx) => {
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [res.date]);

    const night = await trx('nightly_capacity')
      .select('date', 'status', 'capacity', 'override_capacity', 'confirmed_count')
      .where({ date: res.date })
      .forUpdate()
      .first();

    await trx('reservations').where({ id: reservationId }).update({
      status: 'cancelled',
      updated_at: trx.fn.now(),
    });

    if (night && night.confirmed_count > 0) {
      await trx('nightly_capacity')
        .where({ date: res.date })
        .update({
          confirmed_count: trx.raw('GREATEST(confirmed_count - 1, 0)'),
          updated_at: trx.fn.now(),
        });

      const effectiveCapacity = night.override_capacity ?? night.capacity;
      if (night.status === 'full' && night.confirmed_count - 1 < effectiveCapacity) {
        await trx('nightly_capacity')
          .where({ date: res.date })
          .update({ status: 'open', updated_at: trx.fn.now() });
      }
    }
  });

  // Waitlist promotion happens outside the transaction so cancellation is never
  // rolled back due to a waitlist issue.
  await waitlist.offerNextInLine(res.date);

  return { success: true, freedDate: res.date };
}

async function cancelReservationLegacy(reservationId) {
  const res = await db('reservations').where({ id: reservationId }).first();
  if (!res) return { error: 'Reservation not found' };

  await db('reservations').where({ id: reservationId }).delete();

  // Offer freed spot to waitlist
  await waitlist.offerNextInLine(res.date);

  return { success: true, freedDate: res.date };
}

async function cancelReservation(reservationId) {
  if (isPostgres()) {
    return cancelReservationSafe(reservationId);
  }
  return cancelReservationLegacy(reservationId);
}

/**
 * Transaction-safe block cancellation for PostgreSQL.
 */
async function cancelBlockSafe(blockId) {
  const block = await db('overnight_blocks').where({ id: blockId }).first();
  if (!block) return { error: 'Block not found' };

  const reservations = await db('reservations')
    .where({ overnight_block_id: blockId })
    .whereNot('status', 'cancelled')
    .whereNot('status', 'canceled_low_enrollment');
  const dates = reservations.map((r) => r.date).sort();

  await db.transaction(async (trx) => {
    for (const date of dates) {
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [date]);

      const night = await trx('nightly_capacity')
        .select('date', 'status', 'capacity', 'override_capacity', 'confirmed_count')
        .where({ date })
        .forUpdate()
        .first();

      if (night && night.confirmed_count > 0) {
        await trx('nightly_capacity')
          .where({ date })
          .update({
            confirmed_count: trx.raw('GREATEST(confirmed_count - 1, 0)'),
            updated_at: trx.fn.now(),
          });

        const effectiveCapacity = night.override_capacity ?? night.capacity;
        if (night.status === 'full' && night.confirmed_count - 1 < effectiveCapacity) {
          await trx('nightly_capacity')
            .where({ date })
            .update({ status: 'open', updated_at: trx.fn.now() });
        }
      }
    }

    await trx('reservations')
      .where({ overnight_block_id: blockId })
      .whereNot('status', 'cancelled')
      .whereNot('status', 'canceled_low_enrollment')
      .update({ status: 'cancelled', updated_at: trx.fn.now() });

    await trx('overnight_blocks').where({ id: blockId }).update({
      status: 'cancelled',
      updated_at: trx.fn.now(),
    });
  });

  // Waitlist promotion outside the transaction
  for (const date of dates) {
    await waitlist.offerNextInLine(date);
  }

  return { success: true, freedDates: dates };
}

async function cancelBlockLegacy(blockId) {
  const block = await db('overnight_blocks').where({ id: blockId }).first();
  if (!block) return { error: 'Block not found' };

  const reservations = await db('reservations').where({ overnight_block_id: blockId });
  const dates = reservations.map((r) => r.date);

  await db.transaction(async (trx) => {
    await trx('reservations').where({ overnight_block_id: blockId }).delete();
    await trx('overnight_blocks').where({ id: blockId }).update({ status: 'cancelled' });
  });

  // Offer freed spots to waitlist
  for (const date of dates) {
    await waitlist.offerNextInLine(date);
  }

  return { success: true, freedDates: dates };
}

async function cancelBlock(blockId) {
  if (isPostgres()) {
    return cancelBlockSafe(blockId);
  }
  return cancelBlockLegacy(blockId);
}

async function getReservationsForBlock(blockId) {
  return db('reservations').where({ overnight_block_id: blockId });
}

async function getReservationsForChild(childId) {
  return db('reservations').where({ child_id: childId }).orderBy('date');
}

module.exports = {
  getWeekDates,
  createReservation,
  swapNights,
  cancelReservation,
  cancelBlock,
  getReservationsForBlock,
  getReservationsForChild,
};
