import { SupabaseClient } from '@supabase/supabase-js';

export interface ReopenInput {
  programId: string;
  centerId: string;
  startDate: string;
  endDate: string;
  reasonText?: string;
  actorUserId: string;
  defaultCapacity: number;
}

export interface ReopenResult {
  datesProcessed: number;
  overridesDeactivated: number;
}

/**
 * Reopen nights by deactivating active overrides and restoring default capacity.
 */
export async function reopenNights(
  supabase: SupabaseClient,
  input: ReopenInput
): Promise<ReopenResult> {
  const dates: string[] = [];
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  let overridesDeactivated = 0;

  for (const careDate of dates) {
    // Find active override
    const { data: override } = await supabase
      .from('capacity_overrides')
      .select('id, override_type, capacity_override')
      .eq('program_id', input.programId)
      .eq('care_date', careDate)
      .eq('is_active', true)
      .single();

    if (!override) continue;

    // Deactivate
    await supabase
      .from('capacity_overrides')
      .update({ is_active: false, updated_by_user_id: input.actorUserId })
      .eq('id', override.id);

    overridesDeactivated++;

    // Restore capacity
    const { data: cap } = await supabase
      .from('program_capacity')
      .select('id, capacity_total, capacity_reserved, status')
      .eq('program_id', input.programId)
      .eq('care_date', careDate)
      .single();

    if (cap) {
      const restoredTotal = input.defaultCapacity;
      const newStatus = cap.capacity_reserved >= restoredTotal ? 'full' : 'open';
      await supabase
        .from('program_capacity')
        .update({ capacity_total: restoredTotal, status: newStatus })
        .eq('id', cap.id);
    }

    // Log event
    await supabase.from('capacity_override_events').insert({
      capacity_override_id: override.id,
      center_id: input.centerId,
      program_id: input.programId,
      care_date: careDate,
      actor_user_id: input.actorUserId,
      event_type: 'night_reopened',
      metadata: {
        previous_override_type: override.override_type,
        previous_capacity_override: override.capacity_override,
        restored_capacity: input.defaultCapacity,
        reason_text: input.reasonText || null,
      },
    });
  }

  return { datesProcessed: dates.length, overridesDeactivated };
}
