const crypto = require('crypto');
const db = require('../db');
const configService = require('./config');
const notifications = require('./notifications');

async function addToWaitlist(date, childId, parentId) {
  const existing = await db('waitlist')
    .where({ date, child_id: childId, status: 'waiting' })
    .first();
  if (existing) {
    return { error: 'Child is already on the waitlist for this date' };
  }

  const entry = {
    id: crypto.randomUUID(),
    date,
    child_id: childId,
    parent_id: parentId,
    status: 'waiting',
  };
  await db('waitlist').insert(entry);
  return { entry };
}

async function offerNextInLine(date) {
  // Expire any stale offers first
  await expireOffers();

  const pending = await db('waitlist')
    .where({ date, status: 'waiting' })
    .orderBy('created_at', 'asc')
    .first();

  if (!pending) return null;

  const ttlMinutes = (await configService.getInt('waitlist_offer_ttl_minutes')) || 120;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  await db('waitlist').where({ id: pending.id }).update({
    status: 'offered',
    offered_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  // Send notification
  const parent = await db('parents').where({ id: pending.parent_id }).first();
  const child = await db('children').where({ id: pending.child_id }).first();
  if (parent && child) {
    await notifications.notifyWaitlistOffer(parent, child, date);
  }

  return { ...pending, status: 'offered', offered_at: now.toISOString(), expires_at: expiresAt.toISOString() };
}

async function acceptOffer(waitlistId) {
  const entry = await db('waitlist').where({ id: waitlistId, status: 'offered' }).first();
  if (!entry) return { error: 'No active offer found' };

  if (entry.expires_at && new Date(entry.expires_at) < new Date()) {
    await db('waitlist').where({ id: waitlistId }).update({ status: 'expired' });
    // Offer to next person
    await offerNextInLine(entry.date);
    return { error: 'Offer has expired' };
  }

  await db('waitlist').where({ id: waitlistId }).update({ status: 'accepted' });
  return { entry: { ...entry, status: 'accepted' } };
}

async function expireOffers() {
  const now = new Date().toISOString();
  const expired = await db('waitlist')
    .where('status', 'offered')
    .where('expires_at', '<', now)
    .select('id', 'date');

  for (const entry of expired) {
    await db('waitlist').where({ id: entry.id }).update({ status: 'expired' });
  }

  // For each date with expired offers, offer next in line
  const dates = [...new Set(expired.map((e) => e.date))];
  for (const date of dates) {
    await offerNextInLine(date);
  }
}

async function getWaitlist(date) {
  return db('waitlist').where({ date }).orderBy('created_at', 'asc');
}

async function removeFromWaitlist(waitlistId) {
  return db('waitlist').where({ id: waitlistId }).delete();
}

module.exports = { addToWaitlist, offerNextInLine, acceptOffer, expireOffers, getWaitlist, removeFromWaitlist };
