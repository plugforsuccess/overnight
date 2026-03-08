import { SupabaseClient } from '@supabase/supabase-js';
import { HealthIssueInput } from './check-capacity';

/**
 * Check attendance-related integrity issues.
 * - missing_attendance_record_for_tonight
 * - attendance_checked_out_without_check_in
 * - attendance_no_show_missing_timestamp
 * - attendance_child_mismatch
 * - attendance_status_inconsistent_with_timestamps
 */
export async function checkAttendance(
  supabase: SupabaseClient
): Promise<HealthIssueInput[]> {
  const issues: HealthIssueInput[] = [];
  const today = new Date().toISOString().split('T')[0];

  // 1. Missing attendance records for tonight's confirmed reservation nights
  const { data: tonightNights } = await supabase
    .from('reservation_nights')
    .select('id, child_id, care_date')
    .eq('care_date', today)
    .in('status', ['confirmed', 'pending']);

  if (tonightNights && tonightNights.length > 0) {
    const nightIds = tonightNights.map((n: any) => n.id);
    const { data: attendanceRows } = await supabase
      .from('attendance_records')
      .select('reservation_night_id')
      .in('reservation_night_id', nightIds);

    const hasAttendance = new Set((attendanceRows || []).map((r: any) => r.reservation_night_id));

    for (const night of tonightNights) {
      if (!hasAttendance.has(night.id)) {
        issues.push({
          issueType: 'missing_attendance_record_for_tonight',
          severity: 'critical',
          careDate: today,
          reservationNightId: night.id,
          childId: night.child_id,
          metadata: { care_date: today },
        });
      }
    }
  }

  // 2. Attendance lifecycle issues (recent 7 days)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const { data: records } = await supabase
    .from('attendance_records')
    .select('id, reservation_night_id, child_id, care_date, attendance_status, checked_in_at, checked_out_at, no_show_marked_at')
    .gte('care_date', weekAgo)
    .lte('care_date', today);

  for (const rec of records || []) {
    // checked_out without check_in
    if (rec.attendance_status === 'checked_out' && !rec.checked_in_at) {
      issues.push({
        issueType: 'attendance_checked_out_without_check_in',
        severity: 'critical',
        careDate: rec.care_date,
        attendanceRecordId: rec.id,
        reservationNightId: rec.reservation_night_id,
        childId: rec.child_id,
        metadata: { status: rec.attendance_status },
      });
    }

    // no_show without timestamp
    if (rec.attendance_status === 'no_show' && !rec.no_show_marked_at) {
      issues.push({
        issueType: 'attendance_no_show_missing_timestamp',
        severity: 'warning',
        careDate: rec.care_date,
        attendanceRecordId: rec.id,
        childId: rec.child_id,
        metadata: { status: rec.attendance_status },
      });
    }

    // checked_in status but no check_in timestamp
    if (rec.attendance_status === 'checked_in' && !rec.checked_in_at) {
      issues.push({
        issueType: 'attendance_status_inconsistent_with_timestamps',
        severity: 'warning',
        careDate: rec.care_date,
        attendanceRecordId: rec.id,
        childId: rec.child_id,
        metadata: {
          status: rec.attendance_status,
          issue: 'checked_in status without check_in timestamp',
        },
      });
    }

    // checked_out timestamp before checked_in timestamp
    if (rec.checked_in_at && rec.checked_out_at && rec.checked_out_at < rec.checked_in_at) {
      issues.push({
        issueType: 'attendance_status_inconsistent_with_timestamps',
        severity: 'critical',
        careDate: rec.care_date,
        attendanceRecordId: rec.id,
        childId: rec.child_id,
        metadata: {
          issue: 'check_out before check_in',
          checked_in_at: rec.checked_in_at,
          checked_out_at: rec.checked_out_at,
        },
      });
    }
  }

  // 3. Attendance child mismatch
  if (records && records.length > 0) {
    const recNightIds = records.map((r: any) => r.reservation_night_id);
    const { data: nights } = await supabase
      .from('reservation_nights')
      .select('id, child_id')
      .in('id', recNightIds);

    const nightChildMap = new Map<string, string>();
    (nights || []).forEach((n: any) => nightChildMap.set(n.id, n.child_id));

    for (const rec of records) {
      const expectedChild = nightChildMap.get(rec.reservation_night_id);
      if (expectedChild && expectedChild !== rec.child_id) {
        issues.push({
          issueType: 'attendance_child_mismatch',
          severity: 'critical',
          careDate: rec.care_date,
          attendanceRecordId: rec.id,
          reservationNightId: rec.reservation_night_id,
          childId: rec.child_id,
          metadata: {
            attendance_child_id: rec.child_id,
            reservation_night_child_id: expectedChild,
          },
        });
      }
    }
  }

  return issues;
}
