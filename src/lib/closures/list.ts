import { SupabaseClient } from '@supabase/supabase-js';

export interface OverrideListItem {
  id: string;
  careDate: string;
  overrideType: string;
  capacityOverride: number | null;
  reasonCode: string;
  reasonText: string | null;
  isActive: boolean;
  createdAt: string;
  effectiveCapacity: number;
  reserved: number;
  waitlisted: number;
  overCapacity: boolean;
  overCapacityBy: number;
}

/**
 * List overrides and their effective state for a date range.
 */
export async function listOverrides(
  supabase: SupabaseClient,
  programId: string,
  startDate: string,
  endDate: string
): Promise<OverrideListItem[]> {
  // Fetch active overrides
  const { data: overrides } = await supabase
    .from('capacity_overrides')
    .select('id, care_date, override_type, capacity_override, reason_code, reason_text, is_active, created_at')
    .eq('program_id', programId)
    .eq('is_active', true)
    .gte('care_date', startDate)
    .lte('care_date', endDate)
    .order('care_date', { ascending: true });

  if (!overrides || overrides.length === 0) return [];

  const dates = overrides.map((o: any) => o.care_date);

  // Fetch capacity data
  const { data: capacityRows } = await supabase
    .from('program_capacity')
    .select('care_date, capacity_total, capacity_reserved, capacity_waitlisted')
    .eq('program_id', programId)
    .in('care_date', dates);

  const capMap = new Map<string, any>();
  (capacityRows || []).forEach((r: any) => capMap.set(r.care_date, r));

  return overrides.map((o: any) => {
    const cap = capMap.get(o.care_date);
    const effectiveCapacity = o.override_type === 'closed' ? 0 : (o.capacity_override ?? cap?.capacity_total ?? 6);
    const reserved = cap?.capacity_reserved ?? 0;
    const waitlisted = cap?.capacity_waitlisted ?? 0;
    const overCapacityBy = Math.max(0, reserved - effectiveCapacity);

    return {
      id: o.id,
      careDate: o.care_date,
      overrideType: o.override_type,
      capacityOverride: o.capacity_override,
      reasonCode: o.reason_code,
      reasonText: o.reason_text,
      isActive: o.is_active,
      createdAt: o.created_at,
      effectiveCapacity,
      reserved,
      waitlisted,
      overCapacity: overCapacityBy > 0,
      overCapacityBy,
    };
  });
}
