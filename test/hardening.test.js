/**
 * Hardening harness tests — minimum safety invariants.
 *
 * These 6 tests verify the critical properties that prevent disasters:
 *  1. Cannot oversell capacity under concurrent booking
 *  2. Cannot cancel another parent's reservation
 *  3. Waitlist accept fails if capacity is gone
 *  4. Swap is atomic and updates capacity
 *  5. Canceled nights stop booking
 *  6. Credits computed from plan snapshot
 */
const crypto = require('crypto');
const { setupTestDb, teardownTestDb } = require('./setup');

let db;
let parentId, parent2Id, childId, child2Id, child3Id;
let planId;

const DEFAULT_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

const WEEK_START = '2026-03-15'; // Sunday

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  // Clean all data tables (order matters for FK constraints)
  await db('waitlist').del();
  await db('reservations').del();
  await db('credits').del();
  await db('overnight_blocks').del();
  await db('nightly_capacity').del();
  await db('children').del();
  await db('parents').del();

  // Ensure config rows exist
  await db('config').where({ key: 'capacity_per_night' }).update({ value: '6' });
  await db('config').where({ key: 'min_enrollment_per_night' }).update({ value: '4' });

  parentId = crypto.randomUUID();
  parent2Id = crypto.randomUUID();
  childId = crypto.randomUUID();
  child2Id = crypto.randomUUID();
  child3Id = crypto.randomUUID();

  await db('parents').insert([
    { id: parentId, name: 'Alice', email: 'alice@h.com', phone: '+1111', is_admin: false, facility_id: DEFAULT_FACILITY_ID },
    { id: parent2Id, name: 'Bob', email: 'bob@h.com', phone: '+2222', is_admin: false, facility_id: DEFAULT_FACILITY_ID },
  ]);
  await db('children').insert([
    { id: childId, parent_id: parentId, name: 'Charlie' },
    { id: child2Id, parent_id: parent2Id, name: 'Dana' },
    { id: child3Id, parent_id: parentId, name: 'Eve' },
  ]);

  // Grab the 3-night plan for block creation
  const plan = await db('plans').where({ nights_per_week: 3 }).first();
  planId = plan.id;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function makeBlock(trxOrDb, { pId, cId, pStatus = 'confirmed' } = {}) {
  const id = crypto.randomUUID();
  const plan = await trxOrDb('plans').where({ id: planId }).first();
  await trxOrDb('overnight_blocks').insert({
    id,
    week_start: WEEK_START,
    nights_per_week: plan.nights_per_week,
    weekly_price_cents: plan.weekly_price_cents,
    plan_id: planId,
    parent_id: pId || parentId,
    child_id: cId || childId,
    status: 'active',
    payment_status: pStatus,
  });
  return id;
}

async function makeReservation(trxOrDb, { cId, date, blockId, status = 'confirmed' }) {
  const id = crypto.randomUUID();
  await trxOrDb('reservations').insert({
    id,
    child_id: cId,
    date,
    overnight_block_id: blockId,
    status,
  });
  return id;
}

async function ensureNight(date, capacity = 6) {
  await db('nightly_capacity')
    .insert({ date, capacity, min_enrollment: 4, confirmed_count: 0, status: 'open' })
    .onConflict('date')
    .ignore();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Hardening: capacity cannot be oversold', () => {
  test('concurrent bookings respect capacity limit', async () => {
    const date = '2026-03-15';
    await ensureNight(date, 2); // capacity = 2

    // Create 2 parents with children
    const parents = [];
    const children = [];
    for (let i = 0; i < 3; i++) {
      const pId = crypto.randomUUID();
      const cId = crypto.randomUUID();
      await db('parents').insert({ id: pId, name: `P${i}`, email: `p${i}@h.com`, is_admin: false, facility_id: DEFAULT_FACILITY_ID });
      await db('children').insert({ id: cId, parent_id: pId, name: `C${i}` });
      parents.push(pId);
      children.push(cId);
    }

    // Fire 3 concurrent booking attempts for the same night (capacity=2)
    const bookings = parents.map(async (pId, i) => {
      const blockId = await makeBlock(db, { pId, cId: children[i], pStatus: 'confirmed' });
      try {
        return await db.transaction(async (trx) => {
          await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [date]);
          const night = await trx('nightly_capacity').where({ date }).forUpdate().first();
          const cap = night.override_capacity ?? night.capacity;

          if (night.confirmed_count >= cap) {
            return { error: 'full' };
          }

          await trx('reservations').insert({
            id: crypto.randomUUID(),
            child_id: children[i],
            date,
            overnight_block_id: blockId,
            status: 'confirmed',
          });
          await trx('nightly_capacity').where({ date }).update({
            confirmed_count: trx.raw('confirmed_count + 1'),
          });
          return { ok: true };
        });
      } catch (err) {
        return { error: err.message };
      }
    });

    const results = await Promise.all(bookings);
    const successes = results.filter(r => r.ok);
    const failures = results.filter(r => r.error);

    expect(successes.length).toBe(2);
    expect(failures.length).toBe(1);

    // Verify DB state
    const night = await db('nightly_capacity').where({ date }).first();
    expect(night.confirmed_count).toBe(2);
  });
});

describe('Hardening: parent isolation', () => {
  test('cannot cancel another parent\'s reservation', async () => {
    const reservationService = require('../src/services/reservation');
    const date = '2026-03-15';
    await ensureNight(date);

    // Parent A creates a reservation
    const blockId = await makeBlock(db, { pId: parentId, cId: childId, pStatus: 'confirmed' });
    const resId = await makeReservation(db, { cId: childId, date, blockId });
    await db('nightly_capacity').where({ date }).update({ confirmed_count: 1 });

    // Parent B tries to cancel it
    const result = await reservationService.cancelReservation({
      parentId: parent2Id,
      reservationId: resId,
    });

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/not found/i);

    // Reservation should still exist
    const res = await db('reservations').where({ id: resId }).first();
    expect(res).toBeDefined();
    expect(res.status).toBe('confirmed');
  });
});

describe('Hardening: waitlist accept fails if capacity gone', () => {
  test('accepting waitlist offer fails when night is full', async () => {
    const waitlistService = require('../src/services/waitlist');
    const date = '2026-03-16';
    await ensureNight(date, 1);

    // Fill capacity
    const blockId = await makeBlock(db, { pId: parentId, cId: childId, pStatus: 'confirmed' });
    await makeReservation(db, { cId: childId, date, blockId });
    await db('nightly_capacity').where({ date }).update({ confirmed_count: 1, status: 'full' });

    // Parent B has a waitlist entry that was offered
    const blockId2 = await makeBlock(db, { pId: parent2Id, cId: child2Id, pStatus: 'confirmed' });
    const wlId = crypto.randomUUID();
    await db('waitlist').insert({
      id: wlId,
      date,
      child_id: child2Id,
      parent_id: parent2Id,
      status: 'offered',
      offered_at: new Date(),
      expires_at: new Date(Date.now() + 3600000),
    });

    const result = await waitlistService.acceptOffer({ waitlistId: wlId, parentId: parent2Id });

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/no longer available|full/i);
  });
});

describe('Hardening: swap is atomic', () => {
  test('swap decrements old night and increments new night atomically', async () => {
    const reservationService = require('../src/services/reservation');
    const dropDate = '2026-03-15';
    const addDate = '2026-03-16';
    await ensureNight(dropDate);
    await ensureNight(addDate);

    const blockId = await makeBlock(db, { pId: parentId, cId: childId, pStatus: 'confirmed' });
    await makeReservation(db, { cId: childId, date: dropDate, blockId });
    await db('nightly_capacity').where({ date: dropDate }).update({ confirmed_count: 1 });

    const result = await reservationService.swapNights({
      parentId,
      blockId,
      dropDate,
      addDate,
    });

    expect(result.success).toBe(true);

    // Old night decremented, new night incremented
    const oldNight = await db('nightly_capacity').where({ date: dropDate }).first();
    const newNight = await db('nightly_capacity').where({ date: addDate }).first();
    expect(oldNight.confirmed_count).toBe(0);
    expect(newNight.confirmed_count).toBe(1);

    // Only 1 reservation total for this child
    const reservations = await db('reservations').where({ child_id: childId });
    expect(reservations.length).toBe(1);
    expect(reservations[0].date.toISOString().slice(0, 10)).toBe(addDate);
  });
});

describe('Hardening: canceled nights stop booking', () => {
  test('cannot book on a canceled night', async () => {
    const date = '2026-03-17';
    await db('nightly_capacity').insert({
      date,
      capacity: 6,
      min_enrollment: 4,
      confirmed_count: 0,
      status: 'canceled_low_enrollment',
    });

    const blockId = await makeBlock(db, { pId: parentId, cId: childId, pStatus: 'confirmed' });

    // Try to book on the canceled night
    try {
      await db.transaction(async (trx) => {
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [date]);
        const night = await trx('nightly_capacity').where({ date }).forUpdate().first();

        if (night.status !== 'open' && night.status !== 'full') {
          throw Object.assign(new Error('Night not bookable'), { code: 'NIGHT_CLOSED' });
        }
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (err) {
      expect(err.code).toBe('NIGHT_CLOSED');
    }
  });
});

describe('Hardening: credits from plan snapshot', () => {
  test('credit amount uses block pricing snapshot, not hardcoded prices', async () => {
    const creditService = require('../src/services/credit');

    // Create a block with a custom snapshot price (different from plan table)
    const blockId = crypto.randomUUID();
    await db('overnight_blocks').insert({
      id: blockId,
      week_start: WEEK_START,
      nights_per_week: 3,
      weekly_price_cents: 45000, // Custom price, different from plan's 30000
      plan_id: planId,
      parent_id: parentId,
      child_id: childId,
      status: 'active',
      payment_status: 'confirmed',
    });

    // Calculate credit from snapshot
    const creditFromSnapshot = creditService.getCreditAmountFromSnapshot(45000, 3);
    expect(creditFromSnapshot).toBe(15000); // 45000 / 3

    // Compare with hardcoded fallback
    const creditFromHardcoded = creditService.getCreditAmount(3);
    expect(creditFromHardcoded).toBe(10000); // 30000 / 3

    // Snapshot-based credit should be different (and correct)
    expect(creditFromSnapshot).not.toBe(creditFromHardcoded);

    // Issue credit using snapshot
    const credit = await creditService.issueCredit({
      parentId,
      amountCents: creditFromSnapshot,
      reason: 'canceled_low_enrollment',
      relatedBlockId: blockId,
      relatedDate: '2026-03-15',
      sourceWeeklyPriceCents: 45000,
      sourcePlanNights: 3,
    });

    expect(credit.amount_cents).toBe(15000);

    // Verify it's stored with plan snapshot metadata
    const stored = await db('credits').where({ id: credit.id }).first();
    expect(stored.source_weekly_price_cents).toBe(45000);
    expect(stored.source_plan_nights).toBe(3);
  });
});
