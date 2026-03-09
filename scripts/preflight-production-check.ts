#!/usr/bin/env tsx
/**
 * Preflight Production Check — Overnight Platform
 *
 * Validates environment, database connectivity, table existence,
 * RPC availability, and attendance consistency before deployment.
 *
 * Usage:
 *   npx tsx scripts/preflight-production-check.ts
 *   npm run preflight
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local if present
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckResult {
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

const results: CheckResult[] = [];

function pass(check: string, message: string) {
  results.push({ check, status: 'pass', message });
}

function fail(check: string, message: string, details?: string) {
  results.push({ check, status: 'fail', message, details });
}

function warn(check: string, message: string, details?: string) {
  results.push({ check, status: 'warn', message, details });
}

// ─── 1. Environment Variable Validation ─────────────────────────────────────

function checkEnvVars(): void {
  console.log('\n--- Environment Variables ---');

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const optional = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  for (const key of required) {
    if (process.env[key]) {
      pass(`env:${key}`, `${key} is set`);
    } else {
      fail(`env:${key}`, `${key} is MISSING — required for operation`);
    }
  }

  for (const key of optional) {
    if (process.env[key]) {
      pass(`env:${key}`, `${key} is set`);
    } else {
      warn(`env:${key}`, `${key} is not set — Stripe features may be unavailable`);
    }
  }

  // Validate URL format
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    try {
      new URL(url);
      pass('env:url_format', 'SUPABASE_URL is a valid URL');
    } catch {
      fail('env:url_format', 'SUPABASE_URL is not a valid URL', url);
    }
  }
}

// ─── 2. Database Connectivity ───────────────────────────────────────────────

async function checkDatabaseConnectivity(supabase: SupabaseClient): Promise<void> {
  console.log('\n--- Database Connectivity ---');

  // Basic connectivity: SELECT 1
  try {
    const { data, error } = await supabase.rpc('reconcile_program_capacity');
    // Just testing connectivity — even if this returns empty, connection works
    // Use a simpler test: query a known table
    const { error: pingError } = await supabase
      .from('programs')
      .select('id')
      .limit(1);

    if (pingError) {
      fail('db:connectivity', 'Database query failed', pingError.message);
    } else {
      pass('db:connectivity', 'Database connection successful');
    }
  } catch (err: any) {
    fail('db:connectivity', 'Database connection error', err.message);
  }
}

// ─── 3. Required Tables ─────────────────────────────────────────────────────

async function checkRequiredTables(supabase: SupabaseClient): Promise<void> {
  console.log('\n--- Required Tables ---');

  const requiredTables = [
    'program_capacity',
    'reservation_nights',
    'child_attendance_sessions',
    'capacity_overrides',
    'health_issues',
    'reservation_events',
    'health_check_runs',
    'programs',
    'parents',
    'children',
    'reservations',
    'admin_settings',
    'audit_log',
  ];

  for (const table of requiredTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        fail(`table:${table}`, `Table "${table}" query failed`, error.message);
      } else {
        pass(`table:${table}`, `Table "${table}" exists and is queryable`);
      }
    } catch (err: any) {
      fail(`table:${table}`, `Table "${table}" error`, err.message);
    }
  }
}

// ─── 4. RPC Availability ────────────────────────────────────────────────────

async function checkRPCAvailability(supabase: SupabaseClient): Promise<void> {
  console.log('\n--- RPC Functions ---');

  // Test RPCs by calling them with parameters that produce no side effects
  // or minimal impact. Some RPCs require valid params to not error.

  const rpcChecks: { name: string; testParams?: Record<string, any>; expectError?: boolean }[] = [
    {
      name: 'reconcile_program_capacity',
      // No params needed — returns drift report
    },
    {
      name: 'ensure_capacity_rows',
      testParams: { p_dates: [], p_default_capacity: 6 },
      // Empty array = no-op
    },
    {
      name: 'atomic_book_nights',
      // This requires real params; we just verify it exists by calling with invalid params
      testParams: { p_child_id: '00000000-0000-0000-0000-000000000000', p_reservation_id: '00000000-0000-0000-0000-000000000000', p_care_dates: [], p_default_capacity: 6 },
      expectError: true, // May fail on business logic but function exists if we get a structured error
    },
    {
      name: 'atomic_cancel_night',
      testParams: { p_night_id: '00000000-0000-0000-0000-000000000000' },
      expectError: true,
    },
    {
      name: 'promote_waitlist',
      testParams: { p_care_date: '1900-01-01' },
      // Old date = no waitlisted entries, returns null
    },
  ];

  for (const rpc of rpcChecks) {
    try {
      const { data, error } = await supabase.rpc(rpc.name, rpc.testParams || {});

      if (error) {
        // Check if it's a "function not found" error vs a business logic error
        if (error.message.includes('not found') || error.message.includes('does not exist') || error.code === '42883') {
          fail(`rpc:${rpc.name}`, `RPC "${rpc.name}" does not exist`, error.message);
        } else if (rpc.expectError) {
          // Expected error = function exists but business logic rejected params
          pass(`rpc:${rpc.name}`, `RPC "${rpc.name}" exists (expected error on test params)`);
        } else {
          warn(`rpc:${rpc.name}`, `RPC "${rpc.name}" returned error`, error.message);
        }
      } else {
        pass(`rpc:${rpc.name}`, `RPC "${rpc.name}" is available and callable`);
      }
    } catch (err: any) {
      fail(`rpc:${rpc.name}`, `RPC "${rpc.name}" call threw exception`, err.message);
    }
  }
}

// ─── 5. Attendance Consistency Check ────────────────────────────────────────

async function checkAttendanceConsistency(supabase: SupabaseClient): Promise<void> {
  console.log('\n--- Attendance Consistency (Tonight) ---');

  const today = new Date().toISOString().split('T')[0];

  try {
    // Count confirmed reservation_nights for tonight
    const { count: nightCount, error: nightError } = await supabase
      .from('reservation_nights')
      .select('*', { count: 'exact', head: true })
      .eq('care_date', today)
      .in('status', ['confirmed', 'pending']);

    if (nightError) {
      fail('attendance:nights', 'Failed to query tonight\'s reservation nights', nightError.message);
      return;
    }

    // Count attendance records for tonight
    const { count: attendanceCount, error: attError } = await supabase
      .from('child_attendance_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('session_date', today);

    if (attError) {
      fail('attendance:records', 'Failed to query tonight\'s attendance records', attError.message);
      return;
    }

    const nights = nightCount ?? 0;
    const attendance = attendanceCount ?? 0;

    if (nights === 0 && attendance === 0) {
      pass('attendance:consistency', `No reservations or attendance for tonight (${today})`);
    } else if (attendance >= nights) {
      pass('attendance:consistency', `Attendance records (${attendance}) cover all reservations (${nights}) for ${today}`);
    } else {
      warn(
        'attendance:consistency',
        `Attendance gap: ${nights} reservations but only ${attendance} attendance records for ${today}`,
        'Run ensureAttendanceForDate() to auto-heal, or POST /api/admin/attendance/tonight to trigger it.'
      );
    }
  } catch (err: any) {
    fail('attendance:consistency', 'Attendance check error', err.message);
  }
}

// ─── 6. Capacity Drift Check ────────────────────────────────────────────────

async function checkCapacityDrift(supabase: SupabaseClient): Promise<void> {
  console.log('\n--- Capacity Drift ---');

  try {
    const { data, error } = await supabase.rpc('reconcile_program_capacity');

    if (error) {
      if (error.message.includes('not found') || error.code === '42883') {
        fail('capacity:drift', 'reconcile_program_capacity RPC not available', error.message);
      } else {
        warn('capacity:drift', 'Capacity reconciliation returned error', error.message);
      }
      return;
    }

    if (!data || data.length === 0) {
      pass('capacity:drift', 'No capacity rows to reconcile (or no drift detected)');
      return;
    }

    const driftRows = data.filter((r: any) =>
      (r.drift_reserved && r.drift_reserved !== 0) ||
      (r.drift_waitlisted && r.drift_waitlisted !== 0)
    );

    if (driftRows.length === 0) {
      pass('capacity:drift', `Checked ${data.length} capacity rows — no drift detected`);
    } else {
      warn(
        'capacity:drift',
        `Drift detected in ${driftRows.length} of ${data.length} capacity rows`,
        JSON.stringify(driftRows.slice(0, 5), null, 2)
      );
    }
  } catch (err: any) {
    fail('capacity:drift', 'Capacity drift check error', err.message);
  }
}

// ─── 7. Active Program Check ────────────────────────────────────────────────

async function checkActiveProgram(supabase: SupabaseClient): Promise<void> {
  console.log('\n--- Active Program ---');

  try {
    const { data, error } = await supabase
      .from('programs')
      .select('id, name, care_type, is_active')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      fail('program:active', 'No active program found — booking and operations will fail');
    } else {
      pass('program:active', `Active program: "${data.name}" (${data.care_type})`);
    }
  } catch (err: any) {
    fail('program:active', 'Active program check error', err.message);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('===========================================');
  console.log('  Preflight Production Check — Overnight');
  console.log('===========================================');

  // Step 1: Check env vars (no DB needed)
  checkEnvVars();

  // Can we proceed with DB checks?
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.log('\n[ABORT] Cannot run database checks without SUPABASE_URL and SERVICE_ROLE_KEY.\n');
    printSummary();
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  // Step 2-7: Run all DB-dependent checks
  await checkDatabaseConnectivity(supabase);
  await checkRequiredTables(supabase);
  await checkRPCAvailability(supabase);
  await checkActiveProgram(supabase);
  await checkAttendanceConsistency(supabase);
  await checkCapacityDrift(supabase);

  // Print summary
  printSummary();

  const failures = results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

function printSummary() {
  const passes = results.filter(r => r.status === 'pass').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const failures = results.filter(r => r.status === 'fail').length;

  console.log('\n===========================================');
  console.log('  PREFLIGHT RESULTS');
  console.log('===========================================');

  for (const r of results) {
    const icon = r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
    const prefix = r.status === 'fail' ? '  !! ' : r.status === 'warn' ? '  ~  ' : '  OK ';
    console.log(`${prefix}[${icon}] ${r.check}: ${r.message}`);
    if (r.details && r.status !== 'pass') {
      console.log(`         ${r.details}`);
    }
  }

  console.log(`\nTotal: ${results.length} checks — ${passes} passed, ${warnings} warnings, ${failures} failed`);

  if (failures > 0) {
    console.log('\nPREFLIGHT FAILED — resolve failures before deployment.\n');
  } else if (warnings > 0) {
    console.log('\nPREFLIGHT PASSED WITH WARNINGS — review before deployment.\n');
  } else {
    console.log('\nPREFLIGHT PASSED — ready for deployment.\n');
  }
}

main().catch(err => {
  console.error('Preflight check crashed:', err);
  process.exit(1);
});
