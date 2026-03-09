#!/usr/bin/env tsx
/**
 * Production Smoke Test — Overnight Platform
 *
 * Simulates core user journeys via Supabase service role:
 *   1. Create parent account
 *   2. Create child profile
 *   3. Book a night
 *   4. Cancel the night
 *   5. Check in (admin flow)
 *   6. Check out (admin flow)
 *   7. Run health checks
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts
 *   npm run smoke-test
 *
 * Prerequisites:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.
 *   The database must be running with all migrations applied.
 *
 * Note: This uses the service role client directly (no HTTP server needed).
 * All test data is cleaned up after the run.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const SEEDED_DEFAULT_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

// ─── State ──────────────────────────────────────────────────────────────────

let supabase: SupabaseClient;
let testUserId: string;
let testParentId: string;
let testChildId: string;
let testReservationId: string;
let testNightId: string;
let testOvernightBlockId: string;
let testPlanId: string;
let activeFacilityId: string;
let planResolution: 'resolved' | 'created';
let cleanupItems: { table: string; id: string }[] = [];

const results: { step: string; status: 'pass' | 'fail'; message: string }[] = [];

function pass(step: string, msg: string) {
  results.push({ step, status: 'pass', message: msg });
  console.log(`  [PASS] ${step}: ${msg}`);
}

function fail(step: string, msg: string) {
  results.push({ step, status: 'fail', message: msg });
  console.log(`  [FAIL] ${step}: ${msg}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function today(): string {
  // Use tomorrow to avoid conflicts with actual operations
  const d = new Date();
  d.setDate(d.getDate() + 30); // 30 days out to avoid conflicts
  return d.toISOString().split('T')[0];
}

function weekStartDateISO(reference: Date = new Date()): string {
  const d = new Date(reference);
  const day = d.getUTCDay(); // 0=Sun ... 6=Sat
  const deltaToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - deltaToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function resolveParentFacilityIdOrThrow(client: SupabaseClient): Promise<string> {
  const { data: seededFacility, error: seededError } = await client
    .from('facilities')
    .select('id')
    .eq('id', SEEDED_DEFAULT_FACILITY_ID)
    .eq('is_active', true)
    .maybeSingle();

  if (seededError) {
    throw new Error(`[facility-resolution] Failed to query seeded facility: ${seededError.message}`);
  }
  if (seededFacility?.id) return seededFacility.id;

  const { data: fallbackFacility, error: fallbackError } = await client
    .from('facilities')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    throw new Error(`[facility-resolution] Failed to query active facilities: ${fallbackError.message}`);
  }
  if (!fallbackFacility?.id) {
    throw new Error('Cannot create parent profile: no active facility context could be resolved.');
  }

  return fallbackFacility.id;
}

// ─── Steps ──────────────────────────────────────────────────────────────────

async function step1_createParent(): Promise<boolean> {
  const timestamp = Date.now();
  const email = `smoke-test-${timestamp}@test.local`;

  // Create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: 'SmokeTest1234!',
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    fail('create_parent', `Auth user creation failed: ${authError?.message}`);
    return false;
  }
  testUserId = authUser.user.id;
  cleanupItems.push({ table: '__auth_user__', id: testUserId });

  let facilityId: string;
  try {
    facilityId = await resolveParentFacilityIdOrThrow(supabase);
  } catch (error: any) {
    fail('create_parent', `Parent facility resolution failed: ${error?.message}`);
    return false;
  }
  activeFacilityId = facilityId;

  // Create parent profile
  const { data: parent, error: parentError } = await supabase
    .from('parents')
    .insert({
      id: testUserId,
      email,
      first_name: 'Smoke',
      last_name: 'Test',
      phone: '555-0000',
      facility_id: facilityId,
    })
    .select('id')
    .single();

  if (parentError || !parent) {
    fail('create_parent', `Parent profile creation failed: ${parentError?.message}`);
    return false;
  }
  testParentId = parent.id;
  cleanupItems.push({ table: 'parents', id: testParentId });

  pass('create_parent', `Created parent ${email} (${testParentId})`);
  return true;
}

async function step2_createChild(): Promise<boolean> {
  const { data: child, error } = await supabase
    .from('children')
    .insert({
      facility_id: activeFacilityId,
      parent_id: testParentId,
      first_name: 'SmokeChild',
      last_name: 'Test',
      date_of_birth: '2020-01-15',
      gender: 'other',
    })
    .select('id')
    .single();

  if (error || !child) {
    fail('create_child', `Child creation failed: ${error?.message}`);
    return false;
  }
  testChildId = child.id;
  cleanupItems.push({ table: 'children', id: testChildId });

  pass('create_child', `Created child SmokeChild (${testChildId})`);
  return true;
}

async function step3_bookNight(): Promise<boolean> {
  const careDate = today();
  const weekStart = weekStartDateISO();

  const { data: existingPlan, error: existingPlanError } = await supabase
    .from('plans')
    .select('id')
    .eq('facility_id', activeFacilityId)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingPlanError) {
    fail('book_night', `Plan resolution failed: ${existingPlanError.message}`);
    return false;
  }

  if (existingPlan?.id) {
    testPlanId = existingPlan.id;
    planResolution = 'resolved';
  } else {
    const { data: createdPlan, error: createdPlanError } = await supabase
      .from('plans')
      .insert({
        name: 'Smoke Test Plan',
        nights_per_week: 1,
        weekly_price_cents: 10000,
        active: true,
        facility_id: activeFacilityId,
      })
      .select('id')
      .single();

    if (createdPlanError || !createdPlan) {
      fail('book_night', `Plan creation failed: ${createdPlanError?.message}`);
      return false;
    }

    testPlanId = createdPlan.id;
    planResolution = 'created';
    cleanupItems.push({ table: 'plans', id: testPlanId });
  }

  // Create overnight block required by reservations. For smoke flow,
  // keep values deterministic and aligned to a single-center context.
  const { data: overnightBlock, error: overnightBlockError } = await supabase
    .from('overnight_blocks')
    .insert({
      week_start: weekStart,
      parent_id: testParentId,
      child_id: testChildId,
      plan_id: testPlanId,
      nights_per_week: 1,
      weekly_price_cents: 10000,
      multi_child_discount_pct: 0,
      status: 'active',
      payment_status: 'confirmed',
      facility_id: activeFacilityId,
    })
    .select('id')
    .single();

  if (overnightBlockError || !overnightBlock) {
    fail('book_night', `Overnight block creation failed: ${overnightBlockError?.message}`);
    return false;
  }
  testOvernightBlockId = overnightBlock.id;
  cleanupItems.push({ table: 'overnight_blocks', id: testOvernightBlockId });

  // Create reservation
  const { data: reservation, error: resError } = await supabase
    .from('reservations')
    .insert({
      facility_id: activeFacilityId,
      child_id: testChildId,
      date: careDate,
      overnight_block_id: testOvernightBlockId,
      status: 'confirmed',
      admin_override: false,
    })
    .select('id')
    .single();

  if (resError || !reservation) {
    fail('book_night', `Reservation creation failed: ${resError?.message}`);
    return false;
  }
  testReservationId = reservation.id;
  cleanupItems.push({ table: 'reservations', id: testReservationId });

  // Create reservation night
  const { data: night, error: nightError } = await supabase
    .from('reservation_nights')
    .insert({
      facility_id: activeFacilityId,
      reservation_id: testReservationId,
      child_id: testChildId,
      care_date: careDate,
      status: 'confirmed',
      capacity_snapshot: 0,
    })
    .select('id')
    .single();

  if (nightError || !night) {
    fail('book_night', `Night booking failed: ${nightError?.message}`);
    return false;
  }
  testNightId = night.id;
  cleanupItems.push({ table: 'reservation_nights', id: testNightId });

  pass('book_night', `Booked night ${careDate} (${testNightId}); plan ${planResolution} (${testPlanId})`);
  return true;
}

async function step4_cancelNight(): Promise<boolean> {
  const { error } = await supabase
    .from('reservation_nights')
    .update({ status: 'cancelled' })
    .eq('id', testNightId);

  if (error) {
    fail('cancel_night', `Cancel failed: ${error.message}`);
    return false;
  }

  // Do not rebook on the same date: reservation_nights has a unique index on
  // (child_id, care_date), so a second insert for this child/date would violate
  // reservation_nights_child_date_unique.
  pass('cancel_night', `Cancelled reservation night ${testNightId} without rebook`);
  return true;
}

async function step5_checkIn(): Promise<boolean> {
  // Create attendance record
  const { data: session, error: sessionError } = await supabase
    .from('child_attendance_sessions')
    .insert({
      facility_id: activeFacilityId,
      reservation_id: testReservationId,
      child_id: testChildId,
      status: 'scheduled',
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    fail('check_in', `Attendance session creation failed: ${sessionError?.message}`);
    return false;
  }
  cleanupItems.push({ table: 'child_attendance_sessions', id: session.id });

  // Check in
  const { error: checkInError } = await supabase
    .from('child_attendance_sessions')
    .update({
      status: 'checked_in',
      check_in_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  if (checkInError) {
    fail('check_in', `Check-in failed: ${checkInError.message}`);
    return false;
  }

  pass('check_in', `Checked in child (session ${session.id})`);
  return true;
}

async function step6_checkOut(): Promise<boolean> {
  // Find the checked-in session
  const { data: session } = await supabase
    .from('child_attendance_sessions')
    .select('id')
    .eq('child_id', testChildId)
    .eq('status', 'checked_in')
    .limit(1)
    .single();

  if (!session) {
    fail('check_out', 'No checked-in session found');
    return false;
  }

  const sessionId = session.id;
  const transitions: Array<'in_care' | 'ready_for_pickup' | 'checked_out'> = [
    'in_care',
    'ready_for_pickup',
    'checked_out',
  ];

  for (const status of transitions) {
    const patch: { status: 'in_care' | 'ready_for_pickup' | 'checked_out'; check_out_at?: string } = {
      status,
    };

    if (status === 'checked_out') {
      patch.check_out_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('child_attendance_sessions')
      .update(patch)
      .eq('id', sessionId);

    if (error) {
      fail('check_out', `Transition to ${status} failed: ${error.message}`);
      return false;
    }
  }

  pass('check_out', `Advanced session ${sessionId} through in_care -> ready_for_pickup -> checked_out`);
  return true;
}

async function step7_healthChecks(): Promise<boolean> {
  // Verify health system tables are accessible
  const { error: runsError } = await supabase
    .from('health_check_runs')
    .select('id')
    .limit(1);

  if (runsError) {
    fail('health_checks', `health_check_runs not accessible: ${runsError.message}`);
    return false;
  }

  const { error: issuesError } = await supabase
    .from('health_issues')
    .select('id')
    .limit(1);

  if (issuesError) {
    fail('health_checks', `health_issues not accessible: ${issuesError.message}`);
    return false;
  }

  pass('health_checks', 'Health system tables are accessible');
  return true;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  console.log('\n--- Cleanup ---');

  // Reverse order to respect foreign keys
  for (const item of [...cleanupItems].reverse()) {
    try {
      if (item.table === '__auth_user__') {
        await supabase.auth.admin.deleteUser(item.id);
        console.log(`  Cleaned up auth user ${item.id}`);
      } else {
        await supabase.from(item.table).delete().eq('id', item.id);
        console.log(`  Cleaned up ${item.table} ${item.id}`);
      }
    } catch {
      console.log(`  Warning: failed to clean up ${item.table} ${item.id}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('===========================================');
  console.log('  Production Smoke Test — Overnight');
  console.log('===========================================\n');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  supabase = createClient(url, serviceKey);

  const steps = [
    { name: 'Create Parent', fn: step1_createParent },
    { name: 'Create Child', fn: step2_createChild },
    { name: 'Book Night', fn: step3_bookNight },
    { name: 'Cancel Night', fn: step4_cancelNight },
    { name: 'Check In', fn: step5_checkIn },
    { name: 'Check Out', fn: step6_checkOut },
    { name: 'Health Checks', fn: step7_healthChecks },
  ];

  let aborted = false;
  for (const step of steps) {
    console.log(`\n--- ${step.name} ---`);
    try {
      const ok = await step.fn();
      if (!ok && ['Create Parent', 'Create Child', 'Book Night'].includes(step.name)) {
        console.log(`\n  [ABORT] ${step.name} failed — cannot continue.`);
        aborted = true;
        break;
      }
    } catch (err: any) {
      fail(step.name.toLowerCase().replace(/ /g, '_'), `Unexpected error: ${err.message}`);
      if (['Create Parent', 'Create Child', 'Book Night'].includes(step.name)) {
        aborted = true;
        break;
      }
    }
  }

  // Always clean up
  await cleanup();

  // Summary
  const passes = results.filter(r => r.status === 'pass').length;
  const failures = results.filter(r => r.status === 'fail').length;

  console.log('\n===========================================');
  console.log('  SMOKE TEST RESULTS');
  console.log('===========================================');
  console.log(`  Passed: ${passes}`);
  console.log(`  Failed: ${failures}`);
  console.log(`  Aborted: ${aborted ? 'yes' : 'no'}`);

  if (failures > 0 || aborted) {
    console.log('\nSMOKE TEST FAILED\n');
    process.exit(1);
  } else {
    console.log('\nSMOKE TEST PASSED — end-to-end flow verified.\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
