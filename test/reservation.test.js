const crypto = require('crypto');

// NODE_ENV=test is set by the npm script, so db will use in-memory SQLite
const db = require('../src/db');
const reservationService = require('../src/services/reservation');
const capacityService = require('../src/services/capacity');
const waitlistService = require('../src/services/waitlist');
const adminService = require('../src/services/admin');

let parentId, parent2Id, adminId, childId, child2Id, child3Id;

const WEEK_START = '2026-03-08'; // A Sunday

beforeAll(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  await db('waitlist').del();
  await db('reservations').del();
  await db('overnight_blocks').del();
  await db('children').del();
  await db('parents').del();
  await db('config').where({ key: 'capacity_per_night' }).update({ value: '6' });

  parentId = crypto.randomUUID();
  parent2Id = crypto.randomUUID();
  adminId = crypto.randomUUID();
  childId = crypto.randomUUID();
  child2Id = crypto.randomUUID();
  child3Id = crypto.randomUUID();

  await db('parents').insert([
    { id: parentId, name: 'Alice', email: 'alice@test.com', phone: '+1111', is_admin: false },
    { id: parent2Id, name: 'Bob', email: 'bob@test.com', phone: '+2222', is_admin: false },
    { id: adminId, name: 'Admin', email: 'admin@test.com', phone: '+0000', is_admin: true },
  ]);
  await db('children').insert([
    { id: childId, parent_id: parentId, name: 'Charlie' },
    { id: child2Id, parent_id: parent2Id, name: 'Dana' },
    { id: child3Id, parent_id: parentId, name: 'Eve' },
  ]);
});

afterAll(async () => {
  await db.destroy();
});

describe('Week dates', () => {
  test('generates Sun-Thu dates', () => {
    const dates = reservationService.getWeekDates(WEEK_START);
    expect(dates).toEqual([
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
    ]);
  });
});

describe('Create reservation', () => {
  test('creates a 3-night reservation', async () => {
    const result = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 3,
      selectedDates: ['2026-03-08', '2026-03-09', '2026-03-10'],
    });

    expect(result.error).toBeUndefined();
    expect(result.reservations).toHaveLength(3);
    expect(result.blockId).toBeDefined();
  });

  test('rejects wrong number of nights', async () => {
    const result = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 3,
      selectedDates: ['2026-03-08', '2026-03-09'],
    });
    expect(result.error).toMatch(/Must select exactly 3 nights/);
  });

  test('rejects dates outside the week', async () => {
    const result = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-20'],
    });
    expect(result.error).toMatch(/not within the week/);
  });

  test('prevents double booking same child same night', async () => {
    await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    const result = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });
    expect(result.error).toMatch(/already booked/);
  });
});

describe('Capacity limits', () => {
  test('blocks reservation when capacity is full', async () => {
    await db('config').where({ key: 'capacity_per_night' }).update({ value: '2' });

    const extraChildId = crypto.randomUUID();
    await db('children').insert({ id: extraChildId, parent_id: parent2Id, name: 'Extra' });

    await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });
    await reservationService.createReservation({
      childId: child2Id,
      parentId: parent2Id,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    const result = await reservationService.createReservation({
      childId: extraChildId,
      parentId: parent2Id,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });
    expect(result.error).toMatch(/full capacity/);
    expect(result.fullDates).toContain('2026-03-08');
  });

  test('returns capacity info for dates', async () => {
    await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    const info = await capacityService.getCapacityForDates(['2026-03-08', '2026-03-09']);
    expect(info[0].reserved).toBe(1);
    expect(info[0].remaining).toBe(5);
    expect(info[1].reserved).toBe(0);
    expect(info[1].remaining).toBe(6);
  });
});

describe('Swap nights', () => {
  test('swaps a night within the same week', async () => {
    const { blockId } = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 2,
      selectedDates: ['2026-03-08', '2026-03-09'],
    });

    const result = await reservationService.swapNights({
      blockId,
      dropDate: '2026-03-09',
      addDate: '2026-03-11',
    });

    expect(result.success).toBe(true);

    const reservations = await reservationService.getReservationsForBlock(blockId);
    const dates = reservations.map((r) => r.date).sort();
    expect(dates).toEqual(['2026-03-08', '2026-03-11']);
  });

  test('rejects swap when new night is full', async () => {
    await db('config').where({ key: 'capacity_per_night' }).update({ value: '1' });

    const { blockId } = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    await reservationService.createReservation({
      childId: child2Id,
      parentId: parent2Id,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-09'],
    });

    const result = await reservationService.swapNights({
      blockId,
      dropDate: '2026-03-08',
      addDate: '2026-03-09',
    });
    expect(result.error).toMatch(/No capacity/);
  });

  test('rejects swap to date outside week', async () => {
    const { blockId } = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    const result = await reservationService.swapNights({
      blockId,
      dropDate: '2026-03-08',
      addDate: '2026-03-20',
    });
    expect(result.error).toMatch(/not within this week/);
  });
});

describe('Waitlist', () => {
  test('adds to waitlist and prevents duplicates', async () => {
    const result1 = await waitlistService.addToWaitlist('2026-03-08', childId, parentId);
    expect(result1.entry).toBeDefined();

    const result2 = await waitlistService.addToWaitlist('2026-03-08', childId, parentId);
    expect(result2.error).toMatch(/already on the waitlist/);
  });

  test('offers spot when reservation is canceled', async () => {
    await db('config').where({ key: 'capacity_per_night' }).update({ value: '1' });

    const { reservations } = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    await waitlistService.addToWaitlist('2026-03-08', child2Id, parent2Id);

    await reservationService.cancelReservation(reservations[0].id);

    const wl = await waitlistService.getWaitlist('2026-03-08');
    expect(wl[0].status).toBe('offered');
    expect(wl[0].expires_at).toBeDefined();
  });

  test('accept offer works', async () => {
    const { entry } = await waitlistService.addToWaitlist('2026-03-08', childId, parentId);
    const offered = await waitlistService.offerNextInLine('2026-03-08');
    expect(offered).not.toBeNull();

    const result = await waitlistService.acceptOffer(offered.id);
    expect(result.entry.status).toBe('accepted');
  });
});

describe('Cancel block', () => {
  test('cancels all reservations in a block', async () => {
    const { blockId } = await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 3,
      selectedDates: ['2026-03-08', '2026-03-09', '2026-03-10'],
    });

    const result = await reservationService.cancelBlock(blockId);
    expect(result.success).toBe(true);
    expect(result.freedDates).toHaveLength(3);

    const remaining = await reservationService.getReservationsForBlock(blockId);
    expect(remaining).toHaveLength(0);
  });
});

describe('Admin', () => {
  test('override capacity adds reservation even when full', async () => {
    await db('config').where({ key: 'capacity_per_night' }).update({ value: '1' });

    await reservationService.createReservation({
      childId,
      parentId,
      weekStart: WEEK_START,
      nightsPerWeek: 1,
      selectedDates: ['2026-03-08'],
    });

    const block2Id = crypto.randomUUID();
    await db('overnight_blocks').insert({
      id: block2Id,
      week_start: WEEK_START,
      nights_per_week: 1,
      parent_id: parent2Id,
      child_id: child2Id,
      status: 'active',
    });

    const result = await adminService.overrideCapacity('2026-03-08', child2Id, block2Id);
    expect(result.reservation).toBeDefined();
    expect(result.reservation.admin_override).toBe(true);

    const count = await capacityService.getReservationCount('2026-03-08');
    expect(count).toBe(2);
  });

  test('confirm from waitlist creates reservation', async () => {
    const { entry } = await waitlistService.addToWaitlist('2026-03-08', childId, parentId);

    const blockId = crypto.randomUUID();
    await db('overnight_blocks').insert({
      id: blockId,
      week_start: WEEK_START,
      nights_per_week: 1,
      parent_id: parentId,
      child_id: childId,
      status: 'active',
    });

    const result = await adminService.confirmFromWaitlist(entry.id, blockId);
    expect(result.reservation).toBeDefined();

    const wl = await waitlistService.getWaitlist('2026-03-08');
    expect(wl[0].status).toBe('accepted');
  });
});
