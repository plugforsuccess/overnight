const crypto = require('crypto');
const db = require('../db');
const capacity = require('./capacity');
const waitlist = require('./waitlist');

const WEEK_NIGHTS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

function getWeekDates(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  return WEEK_NIGHTS.map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

async function createReservation({ childId, parentId, weekStart, nightsPerWeek, selectedDates }) {
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

async function cancelReservation(reservationId) {
  const res = await db('reservations').where({ id: reservationId }).first();
  if (!res) return { error: 'Reservation not found' };

  await db('reservations').where({ id: reservationId }).delete();

  // Offer freed spot to waitlist
  await waitlist.offerNextInLine(res.date);

  return { success: true, freedDate: res.date };
}

async function cancelBlock(blockId) {
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
