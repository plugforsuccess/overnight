const crypto = require('crypto');
const db = require('../src/db');
const reservationService = require('../src/services/reservation');
const enrollmentService = require('../src/services/enrollment');
const creditService = require('../src/services/credit');

const WEEK_START = '2026-03-08'; // A Sunday

let parentId, parent2Id, childId, child2Id, child3Id;

beforeAll(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  await db('credits').del();
  await db('nightly_status').del();
  await db('waitlist').del();
  await db('reservations').del();
  await db('overnight_blocks').del();
  await db('children').del();
  await db('parents').del();
  await db('config').where({ key: 'capacity_per_night' }).update({ value: '6' });
  await db('config').where({ key: 'min_enrollment_per_night' }).update({ value: '4' });

  parentId = crypto.randomUUID();
  parent2Id = crypto.randomUUID();
  childId = crypto.randomUUID();
  child2Id = crypto.randomUUID();
  child3Id = crypto.randomUUID();

  await db('parents').insert([
    { id: parentId, name: 'Alice', email: 'alice@test.com', phone: '+1111', role: 'parent' },
    { id: parent2Id, name: 'Bob', email: 'bob@test.com', phone: '+2222', role: 'parent' },
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

describe('Enrollment enforcement', () => {
  test('does not cancel a night with enough enrollment', async () => {
    // Book 4 children (meets minimum of 4)
    const child4Id = crypto.randomUUID();
    await db('children').insert({ id: child4Id, parent_id: parent2Id, name: 'Frank' });

    await reservationService.createReservation({ childId, parentId, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });
    await reservationService.createReservation({ childId: child2Id, parentId: parent2Id, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });
    await reservationService.createReservation({ childId: child3Id, parentId, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });
    await reservationService.createReservation({ childId: child4Id, parentId: parent2Id, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });

    const result = await enrollmentService.enforceMinimumEnrollment('2026-03-08');
    expect(result.canceled).toBe(false);
    expect(result.count).toBe(4);
  });

  test('cancels a night with fewer than minimum enrollment', async () => {
    // Only 2 children booked (below minimum of 4)
    await reservationService.createReservation({ childId, parentId, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });
    await reservationService.createReservation({ childId: child2Id, parentId: parent2Id, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });

    const result = await enrollmentService.enforceMinimumEnrollment('2026-03-08');
    expect(result.canceled).toBe(true);
    expect(result.canceledReservations).toBe(2);
  });

  test('issues credits when night is canceled', async () => {
    await reservationService.createReservation({ childId, parentId, weekStart: WEEK_START, nightsPerWeek: 3, selectedDates: ['2026-03-08', '2026-03-09', '2026-03-10'] });

    await enrollmentService.enforceMinimumEnrollment('2026-03-08');

    // Should have a credit for $100 (3-night plan: $300/3 = $100)
    const balance = await creditService.getCreditBalance(parentId);
    expect(balance).toBe(10000);
  });

  test('marks night as canceled_low_enrollment', async () => {
    await reservationService.createReservation({ childId, parentId, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });

    await enrollmentService.enforceMinimumEnrollment('2026-03-08');

    const status = await db('nightly_status').where({ date: '2026-03-08' }).first();
    expect(status.status).toBe('canceled_low_enrollment');
  });

  test('getEnrollmentStatus returns correct info', async () => {
    await reservationService.createReservation({ childId, parentId, weekStart: WEEK_START, nightsPerWeek: 1, selectedDates: ['2026-03-08'] });

    const status = await enrollmentService.getEnrollmentStatus('2026-03-08');
    expect(status.enrolled).toBe(1);
    expect(status.minimum).toBe(4);
    expect(status.meetsMinimum).toBe(false);
    expect(status.status).toBe('open');
  });

  test('enforceWeek checks all nights in a week', async () => {
    // Only 1 child on each night — all should be canceled
    await reservationService.createReservation({
      childId, parentId, weekStart: WEEK_START, nightsPerWeek: 5,
      selectedDates: ['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12'],
    });

    const results = await enrollmentService.enforceWeek(WEEK_START);
    expect(results).toHaveLength(5);
    expect(results.every(r => r.canceled)).toBe(true);
  });
});
