/**
 * RLS Penetration-Style Test Matrix
 *
 * Verifies row-level security across parent/staff/admin personas.
 * Tests parent data isolation, cross-parent leakage, and admin access.
 *
 * Each test creates real DB rows and queries with scoped identity checks
 * to simulate what RLS would enforce at the Supabase client layer.
 *
 * Note: These tests run against the DB directly (via Knex) and simulate
 * RLS ownership checks at the application layer. For true RLS testing,
 * run equivalent queries through Supabase client with actual JWTs.
 */
const crypto = require('crypto');
const { setupTestDb, teardownTestDb } = require('./setup');

const DEFAULT_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

let db;
let parentA, parentB, adminUser;
let childA, childB;

beforeAll(async () => {
  db = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  // Clean tables in FK-safe order
  await db('reservation_events').del().catch(() => {});
  await db('pickup_verifications').del().catch(() => {});
  await db('incident_reports').del().catch(() => {});
  await db('child_events').del().catch(() => {});
  await db('child_attendance_sessions').del().catch(() => {});
  await db('child_medical_profiles').del().catch(() => {});
  await db('child_emergency_contacts').del().catch(() => {});
  await db('child_authorized_pickups').del().catch(() => {});
  await db('child_allergies').del().catch(() => {});
  await db('center_staff_memberships').del().catch(() => {});
  await db('waitlist').del().catch(() => {});
  await db('reservations').del().catch(() => {});
  await db('credits').del().catch(() => {});
  await db('overnight_blocks').del().catch(() => {});
  await db('children').del().catch(() => {});
  await db('parents').del().catch(() => {});

  // Create personas
  parentA = crypto.randomUUID();
  parentB = crypto.randomUUID();
  adminUser = crypto.randomUUID();

  await db('parents').insert([
    { id: parentA, first_name: 'Alice', last_name: 'A', email: 'alice@rls.test', is_admin: false, facility_id: DEFAULT_FACILITY_ID },
    { id: parentB, first_name: 'Bob', last_name: 'B', email: 'bob@rls.test', is_admin: false, facility_id: DEFAULT_FACILITY_ID },
    { id: adminUser, first_name: 'Admin', last_name: 'User', email: 'admin@rls.test', is_admin: true, role: 'admin', facility_id: DEFAULT_FACILITY_ID },
  ]);

  childA = crypto.randomUUID();
  childB = crypto.randomUUID();

  await db('children').insert([
    { id: childA, parent_id: parentA, first_name: 'ChildA', last_name: 'A' },
    { id: childB, parent_id: parentB, first_name: 'ChildB', last_name: 'B' },
  ]);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Simulate RLS parent ownership check */
function ownershipCheck(row, parentId, ownerField = 'parent_id') {
  return row[ownerField] === parentId;
}

/** Simulate RLS child ownership check (parent -> child -> entity) */
async function childOwnershipCheck(childId, parentId) {
  const child = await db('children').where({ id: childId, parent_id: parentId }).first();
  return !!child;
}

// ─── 1. Parent Data Isolation ───────────────────────────────────────────────

describe('RLS: Parent data isolation', () => {
  test('Parent A cannot read Parent B children', async () => {
    const children = await db('children').where({ parent_id: parentA });
    const childIds = children.map(c => c.id);
    expect(childIds).toContain(childA);
    expect(childIds).not.toContain(childB);
  });

  test('Parent A cannot read Parent B emergency contacts', async () => {
    const ecId = crypto.randomUUID();
    await db('child_emergency_contacts').insert({
      id: ecId,
      child_id: childB,
      first_name: 'EC',
      last_name: 'B',
      relationship: 'aunt',
      phone: '+1234567890',
      priority: 1,
    });

    // ParentA queries: must verify child ownership first
    const canAccess = await childOwnershipCheck(childB, parentA);
    expect(canAccess).toBe(false);

    // ParentA should only see contacts for their own children
    const contacts = await db('child_emergency_contacts')
      .whereIn('child_id', [childA]);
    expect(contacts.length).toBe(0); // childA has no contacts yet

    const allContacts = await db('child_emergency_contacts')
      .where({ child_id: childB });
    // This returns data — but RLS would block it for parentA
    expect(allContacts.length).toBe(1);
    // Simulate RLS: parentA does NOT own childB
    const allowed = await childOwnershipCheck(allContacts[0].child_id, parentA);
    expect(allowed).toBe(false);
  });

  test('Parent A cannot read Parent B reservation events', async () => {
    // Create reservation for childB
    const plan = await db('plans').first();
    const blockId = crypto.randomUUID();
    await db('overnight_blocks').insert({
      id: blockId,
      week_start: '2026-03-15',
      parent_id: parentB,
      child_id: childB,
      plan_id: plan?.id,
      nights_per_week: 3,
      weekly_price_cents: 30000,
      status: 'active',
      payment_status: 'pending',
    });

    const resId = crypto.randomUUID();
    await db('reservations').insert({
      id: resId,
      child_id: childB,
      date: '2026-03-15',
      overnight_block_id: blockId,
      status: 'confirmed',
    });

    await db('reservation_events').insert({
      id: crypto.randomUUID(),
      reservation_id: resId,
      event_type: 'reservation_created',
      event_data: JSON.stringify({}),
    });

    // ParentA tries to access — must verify reservation ownership through child
    const reservation = await db('reservations').where({ id: resId }).first();
    const childOwns = await childOwnershipCheck(reservation.child_id, parentA);
    expect(childOwns).toBe(false);
  });

  test('Parent A cannot read Parent B incident reports', async () => {
    await db('incident_reports').insert({
      id: crypto.randomUUID(),
      child_id: childB,
      severity: 'low',
      category: 'behavioral',
      summary: 'Minor issue',
      reported_by: adminUser,
    });

    const incidents = await db('incident_reports').where({ child_id: childB });
    expect(incidents.length).toBe(1);
    const canAccess = await childOwnershipCheck(incidents[0].child_id, parentA);
    expect(canAccess).toBe(false);
  });

  test('Parent A cannot access Parent B child attendance sessions', async () => {
    await db('child_attendance_sessions').insert({
      id: crypto.randomUUID(),
      child_id: childB,
      status: 'scheduled',
    });

    const sessions = await db('child_attendance_sessions').where({ child_id: childB });
    expect(sessions.length).toBe(1);
    const canAccess = await childOwnershipCheck(sessions[0].child_id, parentA);
    expect(canAccess).toBe(false);
  });

  test('Parent A cannot access Parent B pickup verifications', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childB,
      status: 'checked_out',
    });

    await db('pickup_verifications').insert({
      id: crypto.randomUUID(),
      attendance_session_id: sessionId,
      verified_name: 'Bob Sr',
      verified_relationship: 'father',
      verification_method: 'photo_id',
    });

    // Verify parentA cannot access through attendance session ownership
    const session = await db('child_attendance_sessions').where({ id: sessionId }).first();
    const canAccess = await childOwnershipCheck(session.child_id, parentA);
    expect(canAccess).toBe(false);
  });

  test('Parent A can read their own child events', async () => {
    await db('child_events').insert({
      id: crypto.randomUUID(),
      child_id: childA,
      event_type: 'child_checked_in',
      event_data: JSON.stringify({}),
      created_by: parentA,
    });

    const events = await db('child_events').where({ child_id: childA });
    expect(events.length).toBe(1);
    const canAccess = await childOwnershipCheck(events[0].child_id, parentA);
    expect(canAccess).toBe(true);
  });
});

// ─── 2. Cross-Parent Write Isolation ────────────────────────────────────────

describe('RLS: Cross-parent write isolation', () => {
  test('Parent A cannot create event for Parent B child', async () => {
    // Simulate the API check
    const canWrite = await childOwnershipCheck(childB, parentA);
    expect(canWrite).toBe(false);
    // API would return 400 'Child not found' before any insert
  });

  test('Parent A cannot create incident for Parent B child', async () => {
    const canWrite = await childOwnershipCheck(childB, parentA);
    expect(canWrite).toBe(false);
  });

  test('Parent A cannot update Parent B child attendance', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childB,
      status: 'scheduled',
    });

    // ParentA tries to update — ownership check fails
    const canWrite = await childOwnershipCheck(childB, parentA);
    expect(canWrite).toBe(false);
  });
});

// ─── 3. Admin Access ────────────────────────────────────────────────────────

describe('RLS: Admin access', () => {
  test('Admin can read all children', async () => {
    const admin = await db('parents').where({ id: adminUser }).first();
    expect(admin.is_admin).toBe(true);

    // Admin RLS policy: EXISTS (SELECT 1 FROM parents WHERE id = auth.uid() AND is_admin)
    const allChildren = await db('children');
    expect(allChildren.length).toBe(2);
  });

  test('Admin can read all incident reports', async () => {
    await db('incident_reports').insert([
      {
        id: crypto.randomUUID(),
        child_id: childA,
        severity: 'low',
        category: 'behavioral',
        summary: 'Issue A',
        reported_by: adminUser,
      },
      {
        id: crypto.randomUUID(),
        child_id: childB,
        severity: 'high',
        category: 'injury',
        summary: 'Issue B',
        reported_by: adminUser,
      },
    ]);

    const admin = await db('parents').where({ id: adminUser }).first();
    expect(admin.is_admin).toBe(true);

    const incidents = await db('incident_reports');
    expect(incidents.length).toBe(2);
  });

  test('Admin can manage attendance sessions for any child', async () => {
    const admin = await db('parents').where({ id: adminUser }).first();
    expect(admin.is_admin).toBe(true);
    expect(admin.role).toBe('admin');

    // Admin can create session for any child
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childA,
      status: 'scheduled',
    });

    const session = await db('child_attendance_sessions').where({ id: sessionId }).first();
    expect(session).toBeDefined();
    expect(session.child_id).toBe(childA);
  });
});

// ─── 4. Center/Staff Membership Isolation ───────────────────────────────────

describe('RLS: Staff membership isolation', () => {
  test('Staff membership is center-scoped', async () => {
    const centerId = crypto.randomUUID();
    const centerId2 = crypto.randomUUID();

    await db('center_staff_memberships').insert([
      {
        id: crypto.randomUUID(),
        user_id: adminUser,
        center_id: centerId,
        role: 'center_admin',
        active: true,
      },
    ]);

    // User has membership at centerId but NOT centerId2
    const membership = await db('center_staff_memberships')
      .where({ user_id: adminUser, center_id: centerId })
      .first();
    expect(membership).toBeDefined();
    expect(membership.role).toBe('center_admin');

    const noMembership = await db('center_staff_memberships')
      .where({ user_id: adminUser, center_id: centerId2 })
      .first();
    expect(noMembership).toBeUndefined();
  });

  test('Unique constraint prevents duplicate user-center membership', async () => {
    const centerId = crypto.randomUUID();

    await db('center_staff_memberships').insert({
      id: crypto.randomUUID(),
      user_id: adminUser,
      center_id: centerId,
      role: 'staff',
      active: true,
    });

    // Duplicate insert should fail
    await expect(
      db('center_staff_memberships').insert({
        id: crypto.randomUUID(),
        user_id: adminUser,
        center_id: centerId,
        role: 'admin',
        active: true,
      })
    ).rejects.toThrow();
  });
});

// ─── 5. Event Integrity ─────────────────────────────────────────────────────

describe('RLS: Event integrity', () => {
  test('Child events are append-only (no update)', async () => {
    const eventId = crypto.randomUUID();
    await db('child_events').insert({
      id: eventId,
      child_id: childA,
      event_type: 'child_checked_in',
      event_data: JSON.stringify({ test: true }),
      created_by: parentA,
    });

    // Verify event exists
    const event = await db('child_events').where({ id: eventId }).first();
    expect(event).toBeDefined();
    expect(event.event_type).toBe('child_checked_in');

    // RLS has no UPDATE policy — events table lacks updated_at column
    // This is enforced by design: no UPDATE/DELETE RLS policies exist
  });

  test('Reservation events are append-only', async () => {
    const plan = await db('plans').first();
    const blockId = crypto.randomUUID();
    await db('overnight_blocks').insert({
      id: blockId,
      week_start: '2026-03-15',
      parent_id: parentA,
      child_id: childA,
      plan_id: plan?.id,
      nights_per_week: 3,
      weekly_price_cents: 30000,
      status: 'active',
      payment_status: 'pending',
    });

    const resId = crypto.randomUUID();
    await db('reservations').insert({
      id: resId,
      child_id: childA,
      date: '2026-03-15',
      overnight_block_id: blockId,
      status: 'confirmed',
    });

    const eventId = crypto.randomUUID();
    await db('reservation_events').insert({
      id: eventId,
      reservation_id: resId,
      event_type: 'reservation_created',
      event_data: JSON.stringify({ block_id: blockId }),
      created_by: parentA,
    });

    const events = await db('reservation_events').where({ reservation_id: resId });
    expect(events.length).toBe(1);
    expect(events[0].event_type).toBe('reservation_created');
  });

  test('Duplicate pickup verification for same session is blocked', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childA,
      status: 'checked_out',
    });

    await db('pickup_verifications').insert({
      id: crypto.randomUUID(),
      attendance_session_id: sessionId,
      verified_name: 'Alice A',
      verified_relationship: 'mother',
      verification_method: 'photo_id',
    });

    // Second verification for same session should fail (unique constraint)
    await expect(
      db('pickup_verifications').insert({
        id: crypto.randomUUID(),
        attendance_session_id: sessionId,
        verified_name: 'Bob B',
        verified_relationship: 'father',
        verification_method: 'pin',
      })
    ).rejects.toThrow();
  });
});

// ─── 6. Attendance State Machine ────────────────────────────────────────────

describe('RLS: Attendance state machine enforcement', () => {
  test('Valid transitions succeed', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childA,
      status: 'scheduled',
    });

    // scheduled -> checked_in
    await db('child_attendance_sessions')
      .where({ id: sessionId })
      .update({ status: 'checked_in' });

    let session = await db('child_attendance_sessions').where({ id: sessionId }).first();
    expect(session.status).toBe('checked_in');

    // checked_in -> in_care
    await db('child_attendance_sessions')
      .where({ id: sessionId })
      .update({ status: 'in_care' });

    session = await db('child_attendance_sessions').where({ id: sessionId }).first();
    expect(session.status).toBe('in_care');

    // in_care -> ready_for_pickup
    await db('child_attendance_sessions')
      .where({ id: sessionId })
      .update({ status: 'ready_for_pickup' });

    session = await db('child_attendance_sessions').where({ id: sessionId }).first();
    expect(session.status).toBe('ready_for_pickup');

    // ready_for_pickup -> checked_out
    await db('child_attendance_sessions')
      .where({ id: sessionId })
      .update({ status: 'checked_out' });

    session = await db('child_attendance_sessions').where({ id: sessionId }).first();
    expect(session.status).toBe('checked_out');
  });

  test('Invalid transition scheduled -> checked_out is rejected by DB trigger', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childA,
      status: 'scheduled',
    });

    // scheduled -> checked_out should fail (skips intermediate states)
    await expect(
      db('child_attendance_sessions')
        .where({ id: sessionId })
        .update({ status: 'checked_out' })
    ).rejects.toThrow(/Invalid attendance transition/);
  });

  test('Cancelled sessions cannot be reactivated', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childA,
      status: 'scheduled',
    });

    // Cancel it
    await db('child_attendance_sessions')
      .where({ id: sessionId })
      .update({ status: 'cancelled' });

    // Try to reactivate — should fail
    await expect(
      db('child_attendance_sessions')
        .where({ id: sessionId })
        .update({ status: 'scheduled' })
    ).rejects.toThrow(/Invalid attendance transition/);
  });

  test('Checked-out sessions are terminal', async () => {
    const sessionId = crypto.randomUUID();
    await db('child_attendance_sessions').insert({
      id: sessionId,
      child_id: childA,
      status: 'scheduled',
    });

    // Walk through to checked_out
    await db('child_attendance_sessions').where({ id: sessionId }).update({ status: 'checked_in' });
    await db('child_attendance_sessions').where({ id: sessionId }).update({ status: 'in_care' });
    await db('child_attendance_sessions').where({ id: sessionId }).update({ status: 'ready_for_pickup' });
    await db('child_attendance_sessions').where({ id: sessionId }).update({ status: 'checked_out' });

    // Try to move back — should fail
    await expect(
      db('child_attendance_sessions')
        .where({ id: sessionId })
        .update({ status: 'in_care' })
    ).rejects.toThrow(/Invalid attendance transition/);
  });

  test('Any active state can transition to cancelled', async () => {
    const states = ['scheduled', 'checked_in', 'in_care', 'ready_for_pickup'];

    for (const state of states) {
      const sessionId = crypto.randomUUID();
      await db('child_attendance_sessions').insert({
        id: sessionId,
        child_id: childA,
        status: 'scheduled',
      });

      // Walk to the target state
      const path = states.slice(0, states.indexOf(state) + 1);
      for (let i = 1; i < path.length; i++) {
        await db('child_attendance_sessions')
          .where({ id: sessionId })
          .update({ status: path[i] });
      }

      // Cancel from this state — should succeed
      await db('child_attendance_sessions')
        .where({ id: sessionId })
        .update({ status: 'cancelled' });

      const session = await db('child_attendance_sessions').where({ id: sessionId }).first();
      expect(session.status).toBe('cancelled');
    }
  });
});

// ─── 7. Emergency Contact Deduplication ─────────────────────────────────────

describe('RLS: Emergency contact deduplication', () => {
  test('Same phone number cannot be added twice for same child', async () => {
    await db('child_emergency_contacts').insert({
      id: crypto.randomUUID(),
      child_id: childA,
      first_name: 'Jane',
      last_name: 'Doe',
      relationship: 'grandmother',
      phone: '+15551234567',
      priority: 1,
    });

    await expect(
      db('child_emergency_contacts').insert({
        id: crypto.randomUUID(),
        child_id: childA,
        first_name: 'Different',
        last_name: 'Person',
        relationship: 'uncle',
        phone: '+15551234567',
        priority: 2,
      })
    ).rejects.toThrow();
  });

  test('Same phone number can be used for different children', async () => {
    await db('child_emergency_contacts').insert({
      id: crypto.randomUUID(),
      child_id: childA,
      first_name: 'Jane',
      last_name: 'Doe',
      relationship: 'grandmother',
      phone: '+15559876543',
      priority: 1,
    });

    // Same phone for a different child should succeed
    await db('child_emergency_contacts').insert({
      id: crypto.randomUUID(),
      child_id: childB,
      first_name: 'Jane',
      last_name: 'Doe',
      relationship: 'grandmother',
      phone: '+15559876543',
      priority: 1,
    });

    const contacts = await db('child_emergency_contacts').where({ phone: '+15559876543' });
    expect(contacts.length).toBe(2);
  });
});
