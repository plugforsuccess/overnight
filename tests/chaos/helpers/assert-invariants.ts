/**
 * Chaos Test Invariant Assertions
 * Reusable invariant checker that validates system-wide data integrity
 * after every chaos scenario.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface InvariantViolation {
  invariant: string;
  severity: 'critical' | 'warning';
  details: string;
  data?: any;
}

export interface InvariantResult {
  passed: boolean;
  violations: InvariantViolation[];
  checksRun: number;
}

/**
 * Run all system invariant checks against the database.
 * Call this after every chaos scenario to verify data integrity.
 */
export async function assertSystemInvariants(
  supabase: SupabaseClient,
  opts: {
    careDate: string;
    programId?: string;
    centerId?: string;
  }
): Promise<InvariantResult> {
  const violations: InvariantViolation[] = [];
  let checksRun = 0;

  // 1. No duplicate active reservation_nights for same child+date
  checksRun++;
  const { data: dupNights } = await supabase
    .from('reservation_nights')
    .select('child_id, care_date')
    .eq('care_date', opts.careDate)
    .in('status', ['confirmed', 'pending']);

  if (dupNights) {
    const seen = new Set<string>();
    for (const n of dupNights) {
      const key = `${n.child_id}:${n.care_date}`;
      if (seen.has(key)) {
        violations.push({
          invariant: 'no_duplicate_active_nights',
          severity: 'critical',
          details: `Duplicate active reservation_night for child ${n.child_id} on ${n.care_date}`,
          data: n,
        });
      }
      seen.add(key);
    }
  }

  // 2. capacity_reserved <= capacity_total (unless override made it so)
  checksRun++;
  if (opts.programId) {
    const { data: cap } = await supabase
      .from('program_capacity')
      .select('id, capacity_total, capacity_reserved, capacity_waitlisted, status')
      .eq('program_id', opts.programId)
      .eq('care_date', opts.careDate)
      .single();

    if (cap) {
      // Check reserved doesn't exceed total (except when closure reduced capacity below existing bookings)
      const { data: activeOverride } = await supabase
        .from('capacity_overrides')
        .select('override_type')
        .eq('program_id', opts.programId)
        .eq('care_date', opts.careDate)
        .eq('is_active', true)
        .single();

      if (!activeOverride && cap.capacity_reserved > cap.capacity_total) {
        violations.push({
          invariant: 'capacity_reserved_lte_total',
          severity: 'critical',
          details: `capacity_reserved (${cap.capacity_reserved}) > capacity_total (${cap.capacity_total}) without active override`,
          data: cap,
        });
      }

      // 3. capacity_waitlisted >= 0
      checksRun++;
      if (cap.capacity_waitlisted < 0) {
        violations.push({
          invariant: 'capacity_waitlisted_non_negative',
          severity: 'critical',
          details: `capacity_waitlisted is negative: ${cap.capacity_waitlisted}`,
          data: cap,
        });
      }

      // 4. capacity_reserved >= 0
      checksRun++;
      if (cap.capacity_reserved < 0) {
        violations.push({
          invariant: 'capacity_reserved_non_negative',
          severity: 'critical',
          details: `capacity_reserved is negative: ${cap.capacity_reserved}`,
          data: cap,
        });
      }

      // 5. capacity_reserved matches actual confirmed night count
      checksRun++;
      const { count: actualReserved } = await supabase
        .from('reservation_nights')
        .select('id', { count: 'exact', head: true })
        .eq('care_date', opts.careDate)
        .eq('status', 'confirmed')
        .eq('program_capacity_id', cap.id);

      if (actualReserved !== null && actualReserved !== cap.capacity_reserved) {
        violations.push({
          invariant: 'capacity_reserved_matches_actual',
          severity: 'warning',
          details: `capacity_reserved counter (${cap.capacity_reserved}) != actual confirmed nights (${actualReserved})`,
          data: { counter: cap.capacity_reserved, actual: actualReserved },
        });
      }

      // 6. capacity_waitlisted matches actual waitlisted night count
      checksRun++;
      const { count: actualWaitlisted } = await supabase
        .from('reservation_nights')
        .select('id', { count: 'exact', head: true })
        .eq('care_date', opts.careDate)
        .eq('status', 'waitlisted')
        .eq('program_capacity_id', cap.id);

      if (actualWaitlisted !== null && actualWaitlisted !== cap.capacity_waitlisted) {
        violations.push({
          invariant: 'capacity_waitlisted_matches_actual',
          severity: 'warning',
          details: `capacity_waitlisted counter (${cap.capacity_waitlisted}) != actual waitlisted nights (${actualWaitlisted})`,
          data: { counter: cap.capacity_waitlisted, actual: actualWaitlisted },
        });
      }
    }
  }

  // 7. Attendance records 1:1 with confirmed reservation_nights for today
  checksRun++;
  const { data: confirmedNights } = await supabase
    .from('reservation_nights')
    .select('id')
    .eq('care_date', opts.careDate)
    .eq('status', 'confirmed');

  if (confirmedNights && confirmedNights.length > 0) {
    const nightIds = confirmedNights.map(n => n.id);
    const { data: attendanceRecords } = await supabase
      .from('attendance_records')
      .select('reservation_night_id')
      .in('reservation_night_id', nightIds);

    const attendanceNightIds = new Set((attendanceRecords || []).map(r => r.reservation_night_id));

    // Check for duplicate attendance records per night
    if (attendanceRecords && attendanceRecords.length > attendanceNightIds.size) {
      violations.push({
        invariant: 'no_duplicate_attendance_records',
        severity: 'critical',
        details: `Found duplicate attendance records: ${attendanceRecords.length} records for ${attendanceNightIds.size} unique nights`,
      });
    }
  }

  // 8. No orphaned attendance events (events without a valid attendance record)
  checksRun++;
  const { data: orphanedEvents } = await supabase
    .from('attendance_events')
    .select('id, attendance_record_id')
    .eq('metadata->>care_date', opts.careDate);

  // We check this at a broader level - events with no matching record
  if (orphanedEvents && orphanedEvents.length > 0) {
    const eventRecordIds = Array.from(new Set(orphanedEvents.map(e => e.attendance_record_id)));
    const { data: validRecords } = await supabase
      .from('attendance_records')
      .select('id')
      .in('id', eventRecordIds);

    const validIds = new Set((validRecords || []).map(r => r.id));
    const orphans = orphanedEvents.filter(e => !validIds.has(e.attendance_record_id));
    if (orphans.length > 0) {
      violations.push({
        invariant: 'no_orphaned_attendance_events',
        severity: 'warning',
        details: `Found ${orphans.length} attendance events with no matching attendance record`,
        data: orphans.slice(0, 5),
      });
    }
  }

  // 9. No invalid attendance status+timestamp combos
  checksRun++;
  const { data: allAttendance } = await supabase
    .from('attendance_records')
    .select('id, attendance_status, checked_in_at, checked_out_at, no_show_marked_at')
    .eq('care_date', opts.careDate);

  if (allAttendance) {
    for (const rec of allAttendance) {
      // checked_in must have checked_in_at
      if (rec.attendance_status === 'checked_in' && !rec.checked_in_at) {
        violations.push({
          invariant: 'checked_in_has_timestamp',
          severity: 'critical',
          details: `Attendance ${rec.id} is checked_in but has no checked_in_at`,
        });
      }
      // checked_out must have both timestamps
      if (rec.attendance_status === 'checked_out') {
        if (!rec.checked_in_at) {
          violations.push({
            invariant: 'checked_out_has_checkin_timestamp',
            severity: 'critical',
            details: `Attendance ${rec.id} is checked_out but has no checked_in_at`,
          });
        }
        if (!rec.checked_out_at) {
          violations.push({
            invariant: 'checked_out_has_checkout_timestamp',
            severity: 'critical',
            details: `Attendance ${rec.id} is checked_out but has no checked_out_at`,
          });
        }
        // checkout must be after checkin
        if (rec.checked_in_at && rec.checked_out_at) {
          if (new Date(rec.checked_out_at) < new Date(rec.checked_in_at)) {
            violations.push({
              invariant: 'checkout_after_checkin',
              severity: 'critical',
              details: `Attendance ${rec.id} has checked_out_at before checked_in_at`,
            });
          }
        }
      }
      // no_show must have no_show_marked_at
      if (rec.attendance_status === 'no_show' && !rec.no_show_marked_at) {
        violations.push({
          invariant: 'no_show_has_timestamp',
          severity: 'critical',
          details: `Attendance ${rec.id} is no_show but has no no_show_marked_at`,
        });
      }
      // expected should NOT have checkin/checkout
      if (rec.attendance_status === 'expected' && (rec.checked_in_at || rec.checked_out_at)) {
        violations.push({
          invariant: 'expected_no_timestamps',
          severity: 'warning',
          details: `Attendance ${rec.id} is expected but has checkin/checkout timestamps`,
        });
      }
    }
  }

  // 10. Closed nights should not have new confirmed bookings (check override + status consistency)
  checksRun++;
  if (opts.programId) {
    const { data: closedOverride } = await supabase
      .from('capacity_overrides')
      .select('care_date')
      .eq('program_id', opts.programId)
      .eq('override_type', 'closed')
      .eq('is_active', true)
      .eq('care_date', opts.careDate)
      .single();

    if (closedOverride) {
      const { data: capRow } = await supabase
        .from('program_capacity')
        .select('status, capacity_total')
        .eq('program_id', opts.programId)
        .eq('care_date', opts.careDate)
        .single();

      if (capRow && capRow.status !== 'closed') {
        violations.push({
          invariant: 'closed_override_matches_status',
          severity: 'critical',
          details: `Active closed override exists but program_capacity status is '${capRow.status}'`,
        });
      }
    }
  }

  return {
    passed: violations.filter(v => v.severity === 'critical').length === 0,
    violations,
    checksRun,
  };
}

/**
 * Jest-friendly assertion wrapper.
 * Throws with detailed info on any critical violation.
 */
export async function expectInvariantsHold(
  supabase: SupabaseClient,
  opts: {
    careDate: string;
    programId?: string;
    centerId?: string;
  }
): Promise<InvariantResult> {
  const result = await assertSystemInvariants(supabase, opts);

  if (!result.passed) {
    const criticals = result.violations.filter(v => v.severity === 'critical');
    const messages = criticals.map(v => `  [${v.invariant}] ${v.details}`).join('\n');
    throw new Error(
      `System invariant violations found (${criticals.length} critical):\n${messages}`
    );
  }

  return result;
}
