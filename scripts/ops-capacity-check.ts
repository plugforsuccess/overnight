#!/usr/bin/env tsx
/**
 * Capacity Integrity Sweep — Overnight Platform
 *
 * Runs reconcile_program_capacity() and reports drift.
 * Safe to run at any time — read-only unless drift is found.
 *
 * Usage:
 *   npx tsx scripts/ops-capacity-check.ts
 *   npm run ops:capacity-check
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  console.log('Capacity Integrity Sweep');
  console.log('========================\n');

  // Run reconciliation RPC
  const { data, error } = await supabase.rpc('reconcile_program_capacity');

  if (error) {
    console.error('reconcile_program_capacity() failed:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No capacity rows found to reconcile.');
    console.log('\nResult: nights_checked=0, drift_detected=0, drift_fixed=0');
    process.exit(0);
  }

  const nightsChecked = data.length;
  const driftRows = data.filter((r: any) =>
    (r.drift_reserved && r.drift_reserved !== 0) ||
    (r.drift_waitlisted && r.drift_waitlisted !== 0)
  );
  const driftDetected = driftRows.length;

  console.log(`nights_checked: ${nightsChecked}`);
  console.log(`drift_detected: ${driftDetected}`);

  if (driftDetected === 0) {
    console.log('drift_fixed: 0');
    console.log('\nAll capacity counters are consistent. No action needed.');
    process.exit(0);
  }

  // Report drift details
  console.log('\nDrift details:');
  console.log('─────────────────────────────────────────────────────────');
  for (const row of driftRows) {
    console.log(`  Date: ${row.care_date}`);
    console.log(`    Reserved: counter=${row.counter_reserved}, actual=${row.actual_reserved}, drift=${row.drift_reserved}`);
    console.log(`    Waitlisted: counter=${row.counter_waitlisted}, actual=${row.actual_waitlisted}, drift=${row.drift_waitlisted}`);
  }

  // Fix drift by updating counters to match actual counts
  let driftFixed = 0;
  for (const row of driftRows) {
    const { error: updateError } = await supabase
      .from('program_capacity')
      .update({
        reserved_count: row.actual_reserved,
        waitlisted_count: row.actual_waitlisted,
      })
      .eq('id', row.program_capacity_id);

    if (updateError) {
      console.error(`  Failed to fix ${row.care_date}: ${updateError.message}`);
    } else {
      driftFixed++;
    }
  }

  console.log(`\ndrift_fixed: ${driftFixed}`);

  if (driftFixed === driftDetected) {
    console.log('\nAll drift has been corrected.');
  } else {
    console.log(`\nPartially fixed: ${driftFixed}/${driftDetected} rows corrected.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Capacity check crashed:', err);
  process.exit(1);
});
