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
let programId: string;
let activeFacilityId: string;
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
  // Get program
  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('facility_id', activeFacilityId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!program) {
    fail('book_night', 'No active program found');
    return false;
  }
  programId = program.id;

  // Create reservation
  const { data: reservation, error: resError } = await supabase
    .from('reservations')
    .insert({
      facility_id: activeFacilityId,
      child_id: testChildId,
      program_id: programId,
      status: 'confirmed',
      })
    .select('id')
    .single();

  if (resError || !reservation) {
    fail('book_night', `Reservation creation failed: ${resError?.message}`);
    return false;
  }
  testReservationId = reservation.id;
  cleanupItems.push({ table: 'reservations', id: testReservationId });

  const careDate = today();

  // Ensure capacity row exists
  await supabase.rpc('ensure_capacity_rows', {
    p_dates: [careDate],
    p_default_capacity: 6,
  });

  // Create reservation night
  const { data: night, error: nightError } = await supabase
    .from('reservation_nights')
    .insert({
      facility_id: activeFacilityId,
      reservation_id: testReservationId,
      child_id: testChildId,
      care_date: careDate,
      status: 'confirmed',
    })
    .select('id')
    .single();

  if (nightError || !night) {
    fail('book_night', `Night booking failed: ${nightError?.message}`);
    return false;
  }
  testNightId = night.id;
  cleanupItems.push({ table: 'reservation_nights', id: testNightId });

  pass('book_night', `Booked night ${careDate} (${testNightId})`);
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

  // Rebook for check-in/out tests
  const careDate = today();
  const { data: night, error: rebookError } = await supabase
    .from('reservation_nights')
    .insert({
      facility_id: activeFacilityId,
      reservation_id: testReservationId,
      child_id: testChildId,
      care_date: careDate,
      status: 'confirmed',
    })
    .select('id')
    .single();

  if (rebookError || !night) {
    fail('cancel_night', `Rebook after cancel failed: ${rebookError?.message}`);
    return false;
  }

  // Update night ID and track cleanup
  testNightId = night.id;
  cleanupItems.push({ table: 'reservation_nights', id: testNightId });

  pass('cancel_night', 'Cancelled night and rebooked successfully');
  return true;
}

async function step5_checkIn(): Promise<boolean> {
  // Create attendance record
  const careDate = today();
  const { data: session, error: sessionError } = await supabase
    .from('child_attendance_sessions')
    .insert({
      facility_id: activeFacilityId,
      reservation_night_id: testNightId,
      child_id: testChildId,
      session_date: careDate,
      status: 'expected',
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

  const { error } = await supabase
    .from('child_attendance_sessions')
    .update({
      status: 'checked_out',
      check_out_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  if (error) {
    fail('check_out', `Check-out failed: ${error.message}`);
    return false;
  }

  pass('check_out', `Checked out child (session ${session.id})`);
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
