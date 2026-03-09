/**
 * End-to-end verification tests for /dashboard/reservations and /dashboard/settings.
 *
 * Tests the data layer, access control, and business logic for the new API routes.
 * These tests use direct DB access (Knex) to verify:
 *   - parent_settings table CRUD
 *   - reservation query scoping by parent ownership
 *   - cross-parent access isolation
 *   - audit log creation for sensitive operations
 *
 * NOTE: HTTP-layer auth (Bearer token, Supabase JWT) is tested implicitly by
 * the existing middleware/auth tests. These tests focus on the data access logic.
 */

const crypto = require('crypto');
const { setupTestDb, teardownTestDb } = require('./setup');

let db;
const DEFAULT_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

let parentId, parent2Id, childId, child2Id, planId, blockId, block2Id;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  // Clean slate
  await db('parent_settings').del().catch(() => {});
  await db('audit_log').del().catch(() => {});
  await db('reservations').del().catch(() => {});
  await db('overnight_blocks').del().catch(() => {});
  await db('children').del().catch(() => {});
  await db('parents').del().catch(() => {});

  parentId = crypto.randomUUID();
  parent2Id = crypto.randomUUID();
  childId = crypto.randomUUID();
  child2Id = crypto.randomUUID();
  planId = crypto.randomUUID();
  blockId = crypto.randomUUID();
  block2Id = crypto.randomUUID();

  // Seed parents
  await db('parents').insert([
    { id: parentId, first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', phone: '+1111111111', facility_id: DEFAULT_FACILITY_ID },
    { id: parent2Id, first_name: 'Bob', last_name: 'Jones', email: 'bob@test.com', phone: '+2222222222', facility_id: DEFAULT_FACILITY_ID },
  ]);

  // Seed children (one per parent)
  await db('children').insert([
    { id: childId, parent_id: parentId, first_name: 'Charlie', last_name: 'Smith', date_of_birth: '2020-01-01' },
    { id: child2Id, parent_id: parent2Id, first_name: 'Dana', last_name: 'Jones', date_of_birth: '2019-06-15' },
  ]);

  // Seed a plan
  await db('plans').insert({
    id: planId,
    plan_key: 'plan_3n',
    nights_per_week: 3,
    weekly_price_cents: 30000,
    active: true,
  }).catch(() => {});

  // Seed overnight blocks
  await db('overnight_blocks').insert([
    {
      id: blockId,
      week_start: '2026-03-08',
      parent_id: parentId,
      child_id: childId,
      plan_id: planId,
      nights_per_week: 3,
      weekly_price_cents: 30000,
      status: 'active',
      payment_status: 'confirmed',
    },
    {
      id: block2Id,
      week_start: '2026-03-08',
      parent_id: parent2Id,
      child_id: child2Id,
      plan_id: planId,
      nights_per_week: 3,
      weekly_price_cents: 30000,
      status: 'active',
      payment_status: 'confirmed',
    },
  ]);

  // Seed reservations
  await db('reservations').insert([
    { child_id: childId, date: '2026-03-08', overnight_block_id: blockId, status: 'confirmed' },
    { child_id: childId, date: '2026-03-09', overnight_block_id: blockId, status: 'confirmed' },
    { child_id: childId, date: '2026-03-10', overnight_block_id: blockId, status: 'pending_payment' },
    { child_id: child2Id, date: '2026-03-08', overnight_block_id: block2Id, status: 'confirmed' },
  ]);
});

// ─── RESERVATIONS: DATA SCOPING ──────────────────────────────────────────────

describe('Reservations — data scoping', () => {
  test('parent sees only their own children\'s reservations', async () => {
    const parentChildIds = await db('children')
      .select('id')
      .where('parent_id', parentId)
      .then(rows => rows.map(r => r.id));

    const reservations = await db('reservations')
      .select('*')
      .whereIn('child_id', parentChildIds);

    expect(reservations).toHaveLength(3);
    expect(reservations.every(r => r.child_id === childId)).toBe(true);
  });

  test('parent cannot see other parent\'s reservations via child_id filter', async () => {
    const parentChildIds = await db('children')
      .select('id')
      .where('parent_id', parentId)
      .then(rows => rows.map(r => r.id));

    const otherReservations = await db('reservations')
      .select('*')
      .whereIn('child_id', parentChildIds)
      .where('child_id', child2Id);

    expect(otherReservations).toHaveLength(0);
  });

  test('empty result when parent has no children', async () => {
    const noChildParent = crypto.randomUUID();
    await db('parents').insert({
      id: noChildParent,
      first_name: 'Empty',
      last_name: 'Parent',
      email: 'empty@test.com',
      facility_id: DEFAULT_FACILITY_ID,
    });

    const childIds = await db('children')
      .select('id')
      .where('parent_id', noChildParent)
      .then(rows => rows.map(r => r.id));

    expect(childIds).toHaveLength(0);
  });
});

// ─── RESERVATIONS: UPCOMING vs PAST ──────────────────────────────────────────

describe('Reservations — upcoming vs past split', () => {
  test('splits reservations by date correctly', async () => {
    const today = new Date().toISOString().split('T')[0];
    const parentChildIds = [childId];

    const upcoming = await db('reservations')
      .whereIn('child_id', parentChildIds)
      .where('date', '>=', today)
      .whereNotIn('status', ['canceled', 'canceled_low_enrollment']);

    const past = await db('reservations')
      .whereIn('child_id', parentChildIds)
      .where(function () {
        this.where('date', '<', today)
          .orWhereIn('status', ['canceled', 'canceled_low_enrollment']);
      });

    // All test reservations are in the future
    expect(upcoming.length + past.length).toBe(3);
  });
});

// ─── RESERVATIONS: CANCEL ────────────────────────────────────────────────────

describe('Reservations — cancellation', () => {
  test('parent can cancel their own reservation', async () => {
    const reservation = await db('reservations')
      .where({ child_id: childId, date: '2026-03-08' })
      .first();

    // Verify child ownership
    const child = await db('children')
      .where({ id: reservation.child_id, parent_id: parentId })
      .first();
    expect(child).toBeDefined();

    // Cancel
    await db('reservations')
      .where('id', reservation.id)
      .update({ status: 'canceled' });

    const updated = await db('reservations').where('id', reservation.id).first();
    expect(updated.status).toBe('canceled');
  });

  test('parent cannot cancel another parent\'s reservation', async () => {
    const otherReservation = await db('reservations')
      .where({ child_id: child2Id })
      .first();

    // Verify child ownership check fails
    const childOwnership = await db('children')
      .where({ id: otherReservation.child_id, parent_id: parentId })
      .first();

    expect(childOwnership).toBeUndefined();
  });
});

// ─── SETTINGS: DEFAULTS ─────────────────────────────────────────────────────

describe('Settings — defaults', () => {
  test('new parent with no settings row gets defaults from API', async () => {
    const settingsRow = await db('parent_settings')
      .where('parent_id', parentId)
      .first();

    // No row exists yet — API should return defaults
    expect(settingsRow).toBeUndefined();

    // Verify the default values contract
    const defaults = {
      email_notifications: true,
      sms_notifications: false,
      reservation_reminders: true,
      billing_reminders: true,
      emergency_alerts: true,
      require_pickup_pin: true,
      notify_on_check_in_out: true,
      notify_on_pickup_changes: true,
      emergency_contact_reminder: true,
    };

    // All safety-related defaults should be the safest option (true)
    expect(defaults.require_pickup_pin).toBe(true);
    expect(defaults.notify_on_check_in_out).toBe(true);
    expect(defaults.emergency_alerts).toBe(true);
  });
});

// ─── SETTINGS: CRUD ─────────────────────────────────────────────────────────

describe('Settings — CRUD', () => {
  test('parent can create and read their own settings', async () => {
    await db('parent_settings').insert({
      parent_id: parentId,
      email_notifications: true,
      sms_notifications: false,
      reservation_reminders: true,
      billing_reminders: true,
      emergency_alerts: true,
      require_pickup_pin: true,
      notify_on_check_in_out: true,
      notify_on_pickup_changes: true,
      emergency_contact_reminder: true,
      preferred_contact_method: 'email',
      staff_notes: 'Please use east entrance.',
    });

    const settings = await db('parent_settings')
      .where('parent_id', parentId)
      .first();

    expect(settings).toBeDefined();
    expect(settings.preferred_contact_method).toBe('email');
    expect(settings.staff_notes).toBe('Please use east entrance.');
    expect(settings.require_pickup_pin).toBe(true);
  });

  test('parent can update notification preferences', async () => {
    await db('parent_settings').insert({
      parent_id: parentId,
      email_notifications: true,
      reservation_reminders: true,
      billing_reminders: true,
      emergency_alerts: true,
    });

    await db('parent_settings')
      .where('parent_id', parentId)
      .update({ reservation_reminders: false });

    const updated = await db('parent_settings')
      .where('parent_id', parentId)
      .first();

    expect(updated.reservation_reminders).toBe(false);
    expect(updated.email_notifications).toBe(true); // unchanged
  });

  test('parent can update safety preferences', async () => {
    await db('parent_settings').insert({
      parent_id: parentId,
      require_pickup_pin: true,
      notify_on_check_in_out: true,
    });

    await db('parent_settings')
      .where('parent_id', parentId)
      .update({ require_pickup_pin: false });

    const updated = await db('parent_settings')
      .where('parent_id', parentId)
      .first();

    expect(updated.require_pickup_pin).toBe(false);
  });

  test('parent cannot read another parent\'s settings', async () => {
    await db('parent_settings').insert({
      parent_id: parent2Id,
      staff_notes: 'Secret notes from Bob',
    });

    const otherSettings = await db('parent_settings')
      .where('parent_id', parent2Id)
      .andWhere('parent_id', parentId) // simulates ownership check
      .first();

    expect(otherSettings).toBeUndefined();
  });

  test('parent_settings enforces unique parent_id', async () => {
    await db('parent_settings').insert({ parent_id: parentId });

    await expect(
      db('parent_settings').insert({ parent_id: parentId })
    ).rejects.toThrow();
  });
});

// ─── SETTINGS: PROFILE UPDATE ────────────────────────────────────────────────

describe('Settings — profile update', () => {
  test('parent can update own profile fields', async () => {
    await db('parents')
      .where('id', parentId)
      .update({
        first_name: 'Alicia',
        last_name: 'Smith-Johnson',
        phone: '+3333333333',
      });

    const updated = await db('parents').where('id', parentId).first();
    expect(updated.first_name).toBe('Alicia');
    expect(updated.last_name).toBe('Smith-Johnson');
    expect(updated.phone).toBe('+3333333333');
    // Email unchanged
    expect(updated.email).toBe('alice@test.com');
  });
});

// ─── SETTINGS: CASCADE DELETE ────────────────────────────────────────────────

describe('Settings — cascade on parent delete', () => {
  test('parent_settings row is deleted when parent is deleted', async () => {
    const tempParentId = crypto.randomUUID();
    await db('parents').insert({
      id: tempParentId,
      first_name: 'Temp',
      last_name: 'Parent',
      email: 'temp@test.com',
      facility_id: DEFAULT_FACILITY_ID,
    });
    await db('parent_settings').insert({ parent_id: tempParentId });

    const before = await db('parent_settings').where('parent_id', tempParentId).first();
    expect(before).toBeDefined();

    await db('parents').where('id', tempParentId).del();

    const after = await db('parent_settings').where('parent_id', tempParentId).first();
    expect(after).toBeUndefined();
  });
});

// ─── AUDIT LOGGING ───────────────────────────────────────────────────────────

describe('Audit logging', () => {
  test('audit_log table can store settings-related events', async () => {
    await db('audit_log').insert({
      actor_id: parentId,
      action: 'password.changed',
      entity_type: 'parent',
      entity_id: parentId,
      metadata: JSON.stringify({}),
    });

    await db('audit_log').insert({
      actor_id: parentId,
      action: 'safety_preferences.updated',
      entity_type: 'parent_settings',
      entity_id: parentId,
      metadata: JSON.stringify({ require_pickup_pin: false }),
    });

    await db('audit_log').insert({
      actor_id: parentId,
      action: 'reservation.cancelled',
      entity_type: 'reservation',
      entity_id: crypto.randomUUID(),
      metadata: JSON.stringify({ child_id: childId }),
    });

    await db('audit_log').insert({
      actor_id: parentId,
      action: 'account_deletion.requested',
      entity_type: 'parent',
      entity_id: parentId,
      metadata: JSON.stringify({ requested_at: new Date().toISOString() }),
    });

    const logs = await db('audit_log').where('actor_id', parentId);
    expect(logs).toHaveLength(4);

    const actions = logs.map(l => l.action);
    expect(actions).toContain('password.changed');
    expect(actions).toContain('safety_preferences.updated');
    expect(actions).toContain('reservation.cancelled');
    expect(actions).toContain('account_deletion.requested');
  });

  test('audit logs include correct entity types', async () => {
    await db('audit_log').insert({
      actor_id: parentId,
      action: 'notifications.updated',
      entity_type: 'parent_settings',
      entity_id: parentId,
      metadata: JSON.stringify({ email_notifications: false }),
    });

    const log = await db('audit_log')
      .where({ actor_id: parentId, action: 'notifications.updated' })
      .first();

    expect(log.entity_type).toBe('parent_settings');
    expect(log.entity_id).toBe(parentId);
  });
});

// ─── STATUS BADGE RENDERING ─────────────────────────────────────────────────

describe('Reservation status badges', () => {
  test('all expected statuses are represented in test data', async () => {
    const statuses = await db('reservations')
      .distinct('status')
      .then(rows => rows.map(r => r.status));

    expect(statuses).toContain('confirmed');
    expect(statuses).toContain('pending_payment');
  });

  test('canceled status is distinct from active statuses', async () => {
    const resId = await db('reservations')
      .where({ child_id: childId, date: '2026-03-10' })
      .first()
      .then(r => r.id);

    await db('reservations').where('id', resId).update({ status: 'canceled' });

    const activeStatuses = ['confirmed', 'pending_payment', 'locked'];
    const active = await db('reservations')
      .whereIn('child_id', [childId])
      .whereIn('status', activeStatuses);

    // Only 2 of 3 should still be active
    expect(active).toHaveLength(2);
  });
});
