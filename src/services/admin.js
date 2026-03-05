const crypto = require('crypto');
const db = require('../db');
const configService = require('./config');
const waitlist = require('./waitlist');

async function overrideCapacity(date, childId, blockId) {
  // Check for double booking even on override
  const existing = await db('reservations')
    .where({ child_id: childId, date })
    .first();
  if (existing) return { error: `Child is already booked for ${date}` };

  const reservation = {
    id: crypto.randomUUID(),
    child_id: childId,
    date,
    overnight_block_id: blockId,
    admin_override: true,
  };
  await db('reservations').insert(reservation);
  return { reservation };
}

async function confirmFromWaitlist(waitlistId, blockId) {
  const entry = await db('waitlist').where({ id: waitlistId }).first();
  if (!entry) return { error: 'Waitlist entry not found' };
  if (entry.status === 'accepted') return { error: 'Already accepted' };

  // Check for double booking
  const existing = await db('reservations')
    .where({ child_id: entry.child_id, date: entry.date })
    .first();
  if (existing) return { error: `Child is already booked for ${entry.date}` };

  const reservation = {
    id: crypto.randomUUID(),
    child_id: entry.child_id,
    date: entry.date,
    overnight_block_id: blockId,
    admin_override: true,
  };

  await db.transaction(async (trx) => {
    await trx('reservations').insert(reservation);
    await trx('waitlist').where({ id: waitlistId }).update({ status: 'accepted' });
  });

  return { reservation };
}

async function setCapacity(value) {
  await configService.set('capacity_per_night', value);
  return { capacity: value };
}

async function setOfferTtl(minutes) {
  await configService.set('waitlist_offer_ttl_minutes', minutes);
  return { ttlMinutes: minutes };
}

module.exports = { overrideCapacity, confirmFromWaitlist, setCapacity, setOfferTtl };
