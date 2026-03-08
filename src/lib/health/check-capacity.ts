import { SupabaseClient } from '@supabase/supabase-js';

export interface HealthIssueInput {
  issueType: string;
  severity: 'critical' | 'warning' | 'info';
  centerId?: string;
  programId?: string;
  careDate?: string;
  reservationNightId?: string;
  attendanceRecordId?: string;
  childId?: string;
  metadata: Record<string, any>;
}

/**
 * Check capacity-related integrity issues.
 * - capacity_reserved drift vs actual reservation_nights count
 * - capacity_waitlisted drift vs actual waitlist count
 * - over_capacity_night (reserved > total)
 * - closed_night_with_open_booking
 */
export async function checkCapacity(
  supabase: SupabaseClient
): Promise<HealthIssueInput[]> {
  const issues: HealthIssueInput[] = [];

  // Get all program_capacity rows for recent/upcoming dates (next 30 days)
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const { data: capacityRows } = await supabase
    .from('program_capacity')
    .select('id, center_id, program_id, care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .gte('care_date', today)
    .lte('care_date', future);

  if (!capacityRows || capacityRows.length === 0) return issues;

  // Get actual reservation_nights counts per program_capacity row
  // Count by program_capacity_id (for linked rows) AND by care_date (for unlinked rows)
  const dates = capacityRows.map((r: any) => r.care_date);
  const capIds = capacityRows.map((r: any) => r.id);
  const { data: nightRows } = await supabase
    .from('reservation_nights')
    .select('care_date, program_capacity_id, status')
    .in('care_date', dates)
    .in('status', ['confirmed', 'pending']);

  // Count by program_capacity_id (primary) and by care_date (fallback for unlinked rows)
  const nightCountByCapId = new Map<string, number>();
  const nightCountByDate = new Map<string, number>();
  (nightRows || []).forEach((r: any) => {
    // Count by care_date for all rows as a fallback
    nightCountByDate.set(r.care_date, (nightCountByDate.get(r.care_date) || 0) + 1);
    // Also count by program_capacity_id for linked rows
    if (r.program_capacity_id) {
      nightCountByCapId.set(r.program_capacity_id, (nightCountByCapId.get(r.program_capacity_id) || 0) + 1);
    }
  });

  // Flag reservation_nights missing program_capacity linkage
  const unlinkedByDate = new Map<string, number>();
  (nightRows || []).forEach((r: any) => {
    if (!r.program_capacity_id) {
      unlinkedByDate.set(r.care_date, (unlinkedByDate.get(r.care_date) || 0) + 1);
    }
  });
  for (const [date, count] of unlinkedByDate) {
    issues.push({
      issueType: 'reservation_night_missing_capacity',
      severity: 'warning',
      careDate: date,
      metadata: { unlinked_count: count },
    });
  }

  // Get waitlist counts by date
  const { data: waitlistRows } = await supabase
    .from('waitlist')
    .select('date')
    .in('date', dates)
    .in('status', ['waiting', 'offered']);

  const waitlistCountByDate = new Map<string, number>();
  (waitlistRows || []).forEach((r: any) => {
    waitlistCountByDate.set(r.date, (waitlistCountByDate.get(r.date) || 0) + 1);
  });

  // Check active overrides for closed nights
  const { data: overrides } = await supabase
    .from('capacity_overrides')
    .select('care_date, override_type, program_id')
    .eq('is_active', true)
    .in('care_date', dates);

  const closedDates = new Set<string>();
  (overrides || []).forEach((o: any) => {
    if (o.override_type === 'closed') closedDates.add(o.care_date);
  });

  for (const cap of capacityRows) {
    // Use linked count if available, fall back to date-based count for unlinked rows
    const linkedCount = nightCountByCapId.get(cap.id) || 0;
    const unlinkedCount = unlinkedByDate.get(cap.care_date) || 0;
    const actualReserved = linkedCount + unlinkedCount;
    const actualWaitlisted = waitlistCountByDate.get(cap.care_date) || 0;

    // capacity_reserved_drift
    if (cap.capacity_reserved !== actualReserved) {
      issues.push({
        issueType: 'capacity_reserved_drift',
        severity: 'warning',
        centerId: cap.center_id,
        programId: cap.program_id,
        careDate: cap.care_date,
        metadata: {
          expected_reserved: actualReserved,
          stored_reserved: cap.capacity_reserved,
          drift: cap.capacity_reserved - actualReserved,
        },
      });
    }

    // capacity_waitlisted_drift
    if (cap.capacity_waitlisted !== actualWaitlisted) {
      issues.push({
        issueType: 'capacity_waitlisted_drift',
        severity: 'warning',
        centerId: cap.center_id,
        programId: cap.program_id,
        careDate: cap.care_date,
        metadata: {
          expected_waitlisted: actualWaitlisted,
          stored_waitlisted: cap.capacity_waitlisted,
          drift: cap.capacity_waitlisted - actualWaitlisted,
        },
      });
    }

    // over_capacity_night
    if (actualReserved > cap.capacity_total && cap.capacity_total > 0) {
      issues.push({
        issueType: 'over_capacity_night',
        severity: 'critical',
        centerId: cap.center_id,
        programId: cap.program_id,
        careDate: cap.care_date,
        metadata: {
          capacity_total: cap.capacity_total,
          actual_reserved: actualReserved,
          over_by: actualReserved - cap.capacity_total,
        },
      });
    }

    // closed_night_with_open_booking
    if (closedDates.has(cap.care_date) && actualReserved > 0) {
      issues.push({
        issueType: 'closed_night_with_open_booking',
        severity: 'critical',
        centerId: cap.center_id,
        programId: cap.program_id,
        careDate: cap.care_date,
        metadata: {
          bookings_count: actualReserved,
          status: cap.status,
        },
      });
    }
  }

  return issues;
}
