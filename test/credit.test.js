const crypto = require('crypto');
const db = require('../src/db');
const creditService = require('../src/services/credit');

const DEFAULT_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

let parentId;

beforeAll(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  await db('credits').del();
  await db('waitlist').del();
  await db('reservations').del();
  await db('overnight_blocks').del();
  await db('children').del();
  await db('parents').del();

  parentId = crypto.randomUUID();
  await db('parents').insert({
    id: parentId, name: 'Alice', email: 'alice@test.com', phone: '+1111', is_admin: false, facility_id: DEFAULT_FACILITY_ID,
  });
});

afterAll(async () => {
  await db.destroy();
});

describe('Credit calculations', () => {
  test('3-night plan credit is $100', () => {
    expect(creditService.getCreditAmount(3)).toBe(10000);
  });

  test('4-night plan credit is $90', () => {
    expect(creditService.getCreditAmount(4)).toBe(9000);
  });

  test('5-night plan credit is $85', () => {
    expect(creditService.getCreditAmount(5)).toBe(8500);
  });

  test('invalid plan returns 0', () => {
    expect(creditService.getCreditAmount(2)).toBe(0);
    expect(creditService.getCreditAmount(6)).toBe(0);
  });
});

describe('Credit issuance', () => {
  test('issues a credit to a parent', async () => {
    const credit = await creditService.issueCredit({
      parentId,
      amountCents: 9000,
      reason: 'canceled_low_enrollment',
    });

    expect(credit.id).toBeDefined();
    expect(credit.amount_cents).toBe(9000);
    expect(credit.applied).toBe(false);
  });

  test('tracks credit balance', async () => {
    await creditService.issueCredit({ parentId, amountCents: 9000, reason: 'canceled_low_enrollment' });
    await creditService.issueCredit({ parentId, amountCents: 10000, reason: 'canceled_low_enrollment' });

    const balance = await creditService.getCreditBalance(parentId);
    expect(balance).toBe(19000);
  });

  test('applies credits and zeroes balance', async () => {
    await creditService.issueCredit({ parentId, amountCents: 9000, reason: 'canceled_low_enrollment' });
    await creditService.issueCredit({ parentId, amountCents: 10000, reason: 'canceled_low_enrollment' });

    const applied = await creditService.applyCredits(parentId);
    expect(applied).toBe(19000);

    const balance = await creditService.getCreditBalance(parentId);
    expect(balance).toBe(0);
  });

  test('getCredits returns all credits', async () => {
    await creditService.issueCredit({ parentId, amountCents: 9000, reason: 'canceled_low_enrollment' });
    await creditService.issueCredit({ parentId, amountCents: 8500, reason: 'admin_manual' });

    const credits = await creditService.getCredits(parentId);
    expect(credits).toHaveLength(2);
  });
});
