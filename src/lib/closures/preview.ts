import { SupabaseClient } from '@supabase/supabase-js';

export interface PreviewInput {
  programId: string;
  startDate: string;
  endDate: string;
  action: 'close' | 'reduce_capacity' | 'reopen';
  capacityOverride?: number | null;
}

export interface DateImpact {
  careDate: string;
  currentCapacityTotal: number;
  currentReserved: number;
  currentWaitlisted: number;
  currentStatus: string;
  affectedBookingsCount: number;
  overCapacityDelta: number;
  communicationNeeded: boolean;
  hasActiveOverride: boolean;
  activeOverrideType: string | null;
}

/**
 * Preview the impact of a closure/reduction action across a date range.
 * Does NOT mutate any data.
 */
export async function previewOverrideImpact(
  supabase: SupabaseClient,
  input: PreviewInput
): Promise<DateImpact[]> {
  // Expand date range
  const dates: string[] = [];
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  if (dates.length === 0) return [];

  // Fetch program_capacity rows for these dates
  const { data: capacityRows } = await supabase
    .from('program_capacity')
    .select('care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .eq('program_id', input.programId)
    .in('care_date', dates);

  const capacityMap = new Map<string, any>();
  (capacityRows || []).forEach((r: any) => capacityMap.set(r.care_date, r));

  // Fetch active overrides for these dates
  const { data: overrides } = await supabase
    .from('capacity_overrides')
    .select('care_date, override_type')
    .eq('program_id', input.programId)
    .eq('is_active', true)
    .in('care_date', dates);

  const overrideMap = new Map<string, string>();
  (overrides || []).forEach((r: any) => overrideMap.set(r.care_date, r.override_type));

  // Fetch confirmed reservation nights counts per date, filtered by program
  // reservation_nights links to program_capacity which has program_id
  const { data: nightCounts } = await supabase
    .from('reservation_nights')
    .select('care_date, program_capacity:program_capacity!inner(program_id)')
    .in('care_date', dates)
    .in('status', ['confirmed', 'pending'])
    .eq('program_capacity.program_id', input.programId);

  const reservedCountMap = new Map<string, number>();
  (nightCounts || []).forEach((r: any) => {
    reservedCountMap.set(r.care_date, (reservedCountMap.get(r.care_date) || 0) + 1);
  });

  // Fetch waitlist counts per date
  // Waitlist is not program-scoped in the current schema, so count all active entries
  const { data: waitlistRows } = await supabase
    .from('waitlist')
    .select('date')
    .in('date', dates)
    .in('status', ['waiting', 'offered']);

  const waitlistCountMap = new Map<string, number>();
  (waitlistRows || []).forEach((r: any) => {
    waitlistCountMap.set(r.date, (waitlistCountMap.get(r.date) || 0) + 1);
  });

  // Build impact per date
  return dates.map(d => {
    const cap = capacityMap.get(d);
    const currentTotal = cap?.capacity_total ?? 6;
    const currentReserved = reservedCountMap.get(d) ?? 0;
    const currentWaitlisted = waitlistCountMap.get(d) ?? 0;
    const currentStatus = cap?.status ?? 'open';
    const hasActiveOverride = overrideMap.has(d);
    const activeOverrideType = overrideMap.get(d) || null;

    let overCapacityDelta = 0;
    let communicationNeeded = false;

    if (input.action === 'close') {
      overCapacityDelta = currentReserved; // all bookings are affected
      communicationNeeded = currentReserved > 0 || currentWaitlisted > 0;
    } else if (input.action === 'reduce_capacity' && input.capacityOverride != null) {
      overCapacityDelta = Math.max(0, currentReserved - input.capacityOverride);
      communicationNeeded = overCapacityDelta > 0 || currentWaitlisted > 0;
    }

    return {
      careDate: d,
      currentCapacityTotal: currentTotal,
      currentReserved,
      currentWaitlisted,
      currentStatus,
      affectedBookingsCount: currentReserved,
      overCapacityDelta,
      communicationNeeded,
      hasActiveOverride,
      activeOverrideType,
    };
  });
}
