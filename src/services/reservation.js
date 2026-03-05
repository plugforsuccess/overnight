const crypto = require('crypto');
const db = require('../db');
const waitlist = require('./waitlist');

const WEEK_NIGHTS = [0, 1, 2, 3, 4]; // Sun..Thu offsets

function assertYmd(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw Object.assign(new Error(`Invalid date format: ${dateStr}`), { code: 'BAD_DATE' });
  }
}

// Safer: treat input as YYYY-MM-DD and add days in UTC without ISO shifts.
function addDaysYmd(ymd, days) {
  assertYmd(ymd);
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getWeekDates(weekStart) {
  assertYmd(weekStart);
  return WEEK_NIGHTS.map((offset) => addDaysYmd(weekStart, offset));
}

function uniqSortedDates(dates) {
  const set = new Set(dates.map((d) => String(d).trim()).filter(Boolean));
  return Array.from(set).sort();
}

async function ensureNightRows(trx, dates) {
  // Ensure nightly_capacity rows exist so we can lock them.
  const rows = dates.map((date) => ({ date }));
  await trx('nightly_capacity').insert(rows).onConflict('date').ignore();
}

async function lockNight(trx, date) {
  // Advisory lock adds belt+suspenders; safe and fast.
  await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [date]);

  const night = await trx('nightly_capacity')
    .where({ date })
    .forUpdate()
    .first();

  if (!night) throw Object.assign(new Error(`nightly_capacity missing for ${date}`), { code: 'NIGHT_MISSING' });

  if (night.status !== 'open' && night.status !== 'full') {
    throw Object.assign(new Error(`Night not bookable: ${date} (${night.status})`), { code: 'NIGHT_CLOSED', details: { date, status: night.status } });
  }

  const cap = night.override_capacity ?? night.capacity;
  if (night.confirmed_count >= cap) {
    if (night.status !== 'full') {
      await trx('nightly_capacity').where({ date }).update({ status: 'full', updated_at: trx.fn.now() });
    }
    throw Object.assign(new Error(`Night full: ${date}`), { code: 'NIGHT_FULL', details: { date, confirmed: night.confirmed_count, capacity: cap } });
  }

  return { night, effectiveCapacity: cap };
}

async function incrementNight(trx, date) {
  const updated = await trx('nightly_capacity')
    .where({ date })
    .update({
      confirmed_count: trx.raw('confirmed_count + 1'),
      updated_at: trx.fn.now()
    })
    .returning(['date', 'capacity', 'override_capacity', 'confirmed_count', 'status']);

  const row = updated?.[0];
  if (!row) return;

  const cap = row.override_capacity ?? row.capacity;
  if (row.confirmed_count >= cap && row.status !== 'full') {
    await trx('nightly_capacity').where({ date }).update({ status: 'full', updated_at: trx.fn.now() });
  }
}

async function decrementNight(trx, date) {
  const updated = await trx('nightly_capacity')
    .where({ date })
    .update({
      confirmed_count: trx.raw('greatest(confirmed_count - 1, 0)'),
      updated_at: trx.fn.now()
    })
    .returning(['date', 'capacity', 'override_capacity', 'confirmed_count', 'status']);

  const row = updated?.[0];
  if (!row) return;

  const cap = row.override_capacity ?? row.capacity;
  if (row.confirmed_count < cap && row.status === 'full') {
    await trx('nightly_capacity').where({ date }).update({ status: 'open', updated_at: trx.fn.now() });
  }
}

/**
 * Create weekly reservation block + nightly reservations.
 * HARDENED:
 * - ownership: child must belong to parent
 * - payment gating: block must be confirmed payment OR your flow must set pending->confirmed later
 * - concurrency safe: locks nightly_capacity rows for selected nights
 */
async function createReservation({ childId, parentId, weekStart, nightsPerWeek, selectedDates }) {
  assertYmd(weekStart);
  const dates = uniqSortedDates(selectedDates);

  // Validate plan nights
  if (![3, 4, 5].includes(Number(nightsPerWeek))) {
    return { error: 'nightsPerWeek must be 3, 4, or 5' };
  }
  if (dates.length !== Number(nightsPerWeek)) {
    return { error: `Must select exactly ${nightsPerWeek} nights, got ${dates.length}` };
  }

  // Validate selected dates are within the allowed week (Sun–Thu)
  const weekDates = getWeekDates(weekStart);
  for (const date of dates) {
    assertYmd(date);
    if (!weekDates.includes(date)) {
      return { error: `Date ${date} is not within the week starting ${weekStart}` };
    }
  }

  // Ownership: child must belong to parent
  const child = await db('children').where({ id: childId, parent_id: parentId }).first();
  if (!child) return { error: 'Child not found for this parent' };

  // Look up the plan for pricing snapshot
  const plan = await db('plans')
    .where({ nights_per_week: Number(nightsPerWeek), active: true })
    .first();
  if (!plan) return { error: `No active plan found for ${nightsPerWeek} nights/week` };

  // Perform everything atomically
  try {
    const result = await db.transaction(async (trx) => {
      // Double booking check under txn
      const existing = await trx('reservations')
        .where({ child_id: childId })
        .whereIn('date', dates);

      if (existing.length > 0) {
        return { error: `Child is already booked for: ${existing.map(r => r.date).join(', ')}` };
      }

      // Ensure night rows exist and lock in sorted order (deadlock-safe)
      await ensureNightRows(trx, dates);
      for (const date of dates) await lockNight(trx, date);

      // Create overnight block with pricing snapshot
      const blockId = crypto.randomUUID();

      // Payment starts as 'pending' until Stripe confirms.
      const payment_status = 'pending';

      await trx('overnight_blocks').insert({
        id: blockId,
        week_start: weekStart,
        nights_per_week: nightsPerWeek,
        weekly_price_cents: plan.weekly_price_cents,
        plan_id: plan.id,
        parent_id: parentId,
        child_id: childId,
        status: 'active',
        payment_status,
      });

      // Insert reservations
      const reservations = dates.map((date) => ({
        id: crypto.randomUUID(),
        child_id: childId,
        date,
        overnight_block_id: blockId,
        status: payment_status === 'confirmed' ? 'confirmed' : 'pending_payment',
      }));

      await trx('reservations').insert(reservations);

      // Increment counts only if confirmed. If pending, confirmed_count should not increase yet.
      if (payment_status === 'confirmed') {
        for (const date of dates) await incrementNight(trx, date);
      }

      return { blockId, reservations };
    });

    return result;
  } catch (err) {
    if (err?.code === '23505') {
      return { error: 'Duplicate booking detected (child already booked for one of the nights)' };
    }
    if (err?.code === 'NIGHT_FULL') {
      return { error: 'Some dates are at full capacity', details: err.details };
    }
    throw err;
  }
}

/**
 * Swap a night inside an existing block.
 * HARDENED:
 * - parent ownership required
 * - transactionally decrement old night and increment new night
 * - locks both nights in sorted order
 */
async function swapNights({ parentId, blockId, dropDate, addDate }) {
  assertYmd(dropDate);
  assertYmd(addDate);

  const block = await db('overnight_blocks')
    .where({ id: blockId, status: 'active', parent_id: parentId })
    .first();

  if (!block) return { error: 'Overnight block not found, not active, or not owned by parent' };

  // Prevent swapping into a different week
  const weekDates = getWeekDates(block.week_start);
  if (!weekDates.includes(addDate)) return { error: `Date ${addDate} is not within this week` };
  if (!weekDates.includes(dropDate)) return { error: `Date ${dropDate} is not within this week` };

  // Only allow swap if payment confirmed (or define policy)
  if (block.payment_status !== 'confirmed') {
    return { error: 'Payment not confirmed; cannot swap nights' };
  }

  const datesToLock = uniqSortedDates([dropDate, addDate]);

  await db.transaction(async (trx) => {
    // Verify drop reservation exists
    const dropRes = await trx('reservations')
      .where({ overnight_block_id: blockId, date: dropDate })
      .first();

    if (!dropRes) throw Object.assign(new Error(`No reservation found for ${dropDate} in this block`), { code: 'NO_DROP' });

    // Child isn't already booked on new date
    const existingOnNew = await trx('reservations')
      .where({ child_id: block.child_id, date: addDate })
      .first();
    if (existingOnNew) throw Object.assign(new Error(`Child already booked for ${addDate}`), { code: 'DUP_NEW' });

    await ensureNightRows(trx, datesToLock);
    for (const d of datesToLock) await lockNight(trx, d);

    // Delete old reservation + decrement count
    await trx('reservations').where({ id: dropRes.id }).delete();
    await decrementNight(trx, dropDate);

    // Insert new reservation + increment count
    await trx('reservations').insert({
      id: crypto.randomUUID(),
      child_id: block.child_id,
      date: addDate,
      overnight_block_id: blockId,
      status: 'confirmed',
    });
    await incrementNight(trx, addDate);
  });

  // Offer freed spot AFTER transaction
  await waitlist.offerNextInLine(dropDate);

  return { success: true, dropped: dropDate, added: addDate };
}

/**
 * Cancel a single reservation (parent-scoped).
 * HARDENED:
 * - verify reservation belongs to parent (via joins)
 * - decrement night count transactionally
 */
async function cancelReservation({ parentId, reservationId }) {
  const row = await db('reservations as r')
    .join('overnight_blocks as b', 'r.overnight_block_id', 'b.id')
    .select('r.id', 'r.date', 'r.status', 'b.parent_id')
    .where('r.id', reservationId)
    .first();

  if (!row || row.parent_id !== parentId) return { error: 'Reservation not found' };

  await db.transaction(async (trx) => {
    await ensureNightRows(trx, [row.date]);
    await lockNight(trx, row.date);

    await trx('reservations').where({ id: reservationId }).delete();

    // decrement only if it was confirmed
    if (row.status === 'confirmed') {
      await decrementNight(trx, row.date);
    }
  });

  await waitlist.offerNextInLine(row.date);

  return { success: true, freedDate: row.date };
}

/**
 * Cancel entire block (parent-scoped).
 * HARDENED:
 * - verify ownership
 * - delete reservations + update block in one transaction
 * - decrement all affected nights
 */
async function cancelBlock({ parentId, blockId }) {
  const block = await db('overnight_blocks')
    .where({ id: blockId, parent_id: parentId })
    .first();

  if (!block) return { error: 'Block not found' };

  const reservations = await db('reservations').where({ overnight_block_id: blockId });
  const dates = uniqSortedDates(reservations.map((r) => r.date));

  await db.transaction(async (trx) => {
    if (dates.length) {
      await ensureNightRows(trx, dates);
      for (const date of dates) await lockNight(trx, date);
    }

    // decrement counts for confirmed reservations
    for (const r of reservations) {
      if (r.status === 'confirmed') {
        await decrementNight(trx, r.date);
      }
    }

    await trx('reservations').where({ overnight_block_id: blockId }).delete();
    await trx('overnight_blocks').where({ id: blockId }).update({ status: 'cancelled' });
  });

  for (const date of dates) {
    await waitlist.offerNextInLine(date);
  }

  return { success: true, freedDates: dates };
}

/**
 * Parent-scoped child reservations lookup.
 */
async function getReservationsForChild({ parentId, childId }) {
  // Ownership enforcement via join to children
  const child = await db('children').where({ id: childId, parent_id: parentId }).first();
  if (!child) return [];

  return db('reservations')
    .where({ child_id: childId })
    .orderBy('date');
}

module.exports = {
  getWeekDates,
  createReservation,
  swapNights,
  cancelReservation,
  cancelBlock,
  getReservationsForChild,
};