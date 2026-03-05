const crypto = require('crypto');
const db = require('../db');
const configService = require('./config');
const notifications = require('./notifications');

// Helpers
function assertYmd(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) {
    const err = new Error(`Invalid date format: ${dateStr}`);
    err.code = 'BAD_DATE';
    throw err;
  }
}

async function getOfferTtlMinutes() {
  return (await configService.getInt('waitlist_offer_ttl_minutes')) || 120;
}

async function ensureNightRow(trx, date) {
  await trx('nightly_capacity')
    .insert({ date })
    .onConflict('date')
    .ignore();
}

async function lockNightRow(trx, date) {
  await trx.raw('select pg_advisory_xact_lock(hashtext(?))', [date]);

  const night = await trx('nightly_capacity')
    .where({ date })
    .forUpdate()
    .first();

  if (!night) throw Object.assign(new Error('Night row missing'), { code: 'NIGHT_MISSING' });

  if (night.status !== 'open' && night.status !== 'full') {
    throw Object.assign(new Error(`Night not bookable: ${night.status}`), { code: 'NIGHT_CLOSED', details: { date, status: night.status } });
  }

  const cap = night.override_capacity ?? night.capacity;
  const remaining = Math.max(cap - Number(night.confirmed_count || 0), 0);

  return { night, cap, remaining };
}

async function incrementNight(trx, date) {
  const updated = await trx('nightly_capacity')
    .where({ date })
    .update({
      confirmed_count: trx.raw('confirmed_count + 1'),
      updated_at: trx.fn.now(),
    })
    .returning(['date', 'capacity', 'override_capacity', 'confirmed_count', 'status']);

  const row = updated?.[0];
  if (!row) return;
  const cap = row.override_capacity ?? row.capacity;
  if (row.confirmed_count >= cap && row.status !== 'full') {
    await trx('nightly_capacity')
      .where({ date })
      .update({ status: 'full', updated_at: trx.fn.now() });
  }
}

/**
 * Parent joins waitlist for a specific date.
 * HARDENED:
 * - enforce parent owns child
 * - prevent duplicates across waiting/offered (not only waiting)
 */
async function addToWaitlist(date, childId, parentId) {
  assertYmd(date);

  // Ownership enforcement: parent must own child
  const child = await db('children').where({ id: childId, parent_id: parentId }).first();
  if (!child) return { error: 'Child not found for this parent' };

  const existing = await db('waitlist')
    .where({ date, child_id: childId })
    .whereIn('status', ['waiting', 'offered'])
    .first();

  if (existing) {
    return { error: 'Child is already on the waitlist (or has an active offer) for this date' };
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

/**
 * Expire offers (non-recursive).
 * Recommend running as a cron job every 5–10 minutes.
 */
async function expireOffers() {
  const expired = await db('waitlist')
    .where('status', 'offered')
    .where('expires_at', '<', db.fn.now())
    .select('id', 'date');

  if (expired.length === 0) return { expired: 0, dates: [] };

  await db('waitlist')
    .whereIn('id', expired.map(e => e.id))
    .update({ status: 'expired' });

  const dates = [...new Set(expired.map((e) => e.date))];
  return { expired: expired.length, dates };
}

/**
 * Offer the next waitlist entry for a date.
 * HARDENED:
 * - transactionally claims next WAITING entry with SKIP LOCKED
 * - verifies night has room and is open
 * - sets offered_at/expires_at
 * - sends notification after commit
 */
async function offerNextInLine(date) {
  assertYmd(date);

  // First expire stale offers (but DO NOT recurse back into offer)
  await expireOffers();

  const ttlMinutes = await getOfferTtlMinutes();

  let offeredRow = null;
  let notifyPayload = null;

  await db.transaction(async (trx) => {
    // If night is closed/canceled/full, don't offer
    await ensureNightRow(trx, date);
    const { remaining, night } = await lockNightRow(trx, date);
    if (night.status !== 'open' && night.status !== 'full') return;
    if (remaining <= 0) return;

    // Claim next waiting entry atomically
    const rows = await trx.raw(
      `
      select *
      from waitlist
      where date = ? and status = 'waiting'
      order by created_at asc
      for update skip locked
      limit 1
      `,
      [date]
    );

    const next = rows?.rows?.[0];
    if (!next) return;

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await trx('waitlist')
      .where({ id: next.id })
      .update({
        status: 'offered',
        offered_at: trx.fn.now(),
        expires_at: expiresAt.toISOString(),
      });

    offeredRow = { ...next, status: 'offered', expires_at: expiresAt.toISOString() };

    // Prepare notification payload (fetch minimal info inside txn)
    const parent = await trx('parents').where({ id: next.parent_id }).first();
    const child = await trx('children').where({ id: next.child_id }).first();
    if (parent && child) notifyPayload = { parent, child, date };
  });

  // Notify after commit to avoid sending offers that later roll back
  if (notifyPayload) {
    await notifications.notifyWaitlistOffer(notifyPayload.parent, notifyPayload.child, notifyPayload.date);
  }

  return offeredRow;
}

/**
 * Accept an offer.
 * HARDENED:
 * - parent-scoped (ownership)
 * - checks expiry
 * - checks night still has capacity and is open
 * - atomically creates reservation + increments capacity
 */
async function acceptOffer({ waitlistId, parentId }) {
  let accepted = null;
  let dateToOfferNext = null;

  await db.transaction(async (trx) => {
    const entry = await trx('waitlist')
      .where({ id: waitlistId })
      .forUpdate()
      .first();

    if (!entry) {
      accepted = { error: 'Waitlist entry not found' };
      return;
    }

    if (entry.parent_id !== parentId) {
      accepted = { error: 'Not authorized to accept this offer' };
      return;
    }

    if (entry.status !== 'offered') {
      accepted = { error: 'No active offer found' };
      return;
    }

    // Expiry check (use DB time)
    const expired = entry.expires_at && new Date(entry.expires_at) < new Date();
    if (expired) {
      await trx('waitlist').where({ id: waitlistId }).update({ status: 'expired' });
      dateToOfferNext = entry.date;
      accepted = { error: 'Offer has expired' };
      return;
    }

    // Ensure the child isn't already booked (defense in depth)
    const existing = await trx('reservations')
      .where({ child_id: entry.child_id, date: entry.date })
      .first();

    if (existing) {
      // Treat as already fulfilled; accept and stop
      await trx('waitlist').where({ id: waitlistId }).update({ status: 'accepted' });
      accepted = { ok: true, note: 'Child already had a reservation for this date', entry: { ...entry, status: 'accepted' } };
      return;
    }

    // Capacity check + lock
    await ensureNightRow(trx, entry.date);
    const { remaining } = await lockNightRow(trx, entry.date);

    if (remaining <= 0) {
      // No longer available; expire and let job offer next
      await trx('waitlist').where({ id: waitlistId }).update({ status: 'expired' });
      dateToOfferNext = entry.date;
      accepted = { error: 'Spot no longer available' };
      return;
    }

    // Create reservation:
    // IMPORTANT: We need an overnight_block_id to attach. In your current model, waitlist is date-specific,
    // not week-block specific. Options:
    // 1) Create a special "waitlist_block" (recommended) for that child/week, OR
    // 2) Allow reservations without block_id (requires schema change), OR
    // 3) Require parent has an active paid block and associate to that block.
    //
    // For now: require an active, confirmed block for the same child/week.
    // Compute weekStart as the Sunday of that week elsewhere, or store week_start on waitlist entries.
    //
    // ✅ RECOMMENDED SCHEMA CHANGE: add waitlist.week_start and waitlist.plan_nights (or block_id).
    //
    // TEMP: find any active confirmed block for that child where entry.date is within that block’s week.
    const block = await trx('overnight_blocks')
      .where({ child_id: entry.child_id, parent_id: parentId, status: 'active', payment_status: 'confirmed' })
      .andWhere('week_start', '<=', entry.date)
      .orderBy('created_at', 'desc')
      .first();

    if (!block) {
      accepted = { error: 'No active paid weekly plan found for this child. Please purchase a weekly plan first.' };
      return;
    }

    await trx('reservations').insert({
      id: crypto.randomUUID(),
      child_id: entry.child_id,
      date: entry.date,
      overnight_block_id: block.id,
      status: 'confirmed',
      admin_override: false,
    });

    await incrementNight(trx, entry.date);

    await trx('waitlist').where({ id: waitlistId }).update({ status: 'accepted' });

    accepted = { ok: true, entry: { ...entry, status: 'accepted' }, reservedDate: entry.date };
  });

  // Offer next in line if we expired/failed
  if (dateToOfferNext) {
    await offerNextInLine(dateToOfferNext);
  }

  return accepted;
}

async function getWaitlist(date) {
  assertYmd(date);
  return db('waitlist').where({ date }).orderBy('created_at', 'asc');
}

async function removeFromWaitlist({ waitlistId, parentId }) {
  // parent-scoped delete
  const entry = await db('waitlist').where({ id: waitlistId, parent_id: parentId }).first();
  if (!entry) return { error: 'Waitlist entry not found' };

  await db('waitlist').where({ id: waitlistId }).delete();
  return { ok: true };
}

module.exports = {
  addToWaitlist,
  offerNextInLine,
  acceptOffer,
  expireOffers,
  getWaitlist,
  removeFromWaitlist,
};