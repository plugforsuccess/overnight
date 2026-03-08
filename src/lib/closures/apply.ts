import { SupabaseClient } from '@supabase/supabase-js';

export interface ApplyOverrideInput {
  programId: string;
  centerId: string;
  startDate: string;
  endDate: string;
  action: 'close' | 'reduce_capacity';
  capacityOverride?: number | null;
  reasonCode: string;
  reasonText?: string;
  actorUserId: string;
}

export interface ApplyResult {
  datesProcessed: number;
  overridesCreated: number;
  overCapacityDates: string[];
}

/**
 * Apply a closure or reduced-capacity override across a date range.
 * - Creates/activates capacity_overrides per date
 * - Updates program_capacity effective state
 * - Logs audit events
 */
export async function applyOverride(
  supabase: SupabaseClient,
  input: ApplyOverrideInput
): Promise<ApplyResult> {
  const dates: string[] = [];
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  const overrideType = input.action === 'close' ? 'closed' : 'reduced_capacity';
  const eventType = input.action === 'close' ? 'night_closed' : 'capacity_reduced';
  let overridesCreated = 0;
  const overCapacityDates: string[] = [];

  for (const careDate of dates) {
    // Fetch and deactivate any existing active override for this date
    const { data: priorOverride } = await supabase
      .from('capacity_overrides')
      .select('id, override_type, capacity_override, reason_code')
      .eq('program_id', input.programId)
      .eq('care_date', careDate)
      .eq('is_active', true)
      .single();

    if (priorOverride) {
      await supabase
        .from('capacity_overrides')
        .update({ is_active: false, updated_by_user_id: input.actorUserId })
        .eq('id', priorOverride.id);
    }

    // Create new override
    const { data: override, error: insertError } = await supabase
      .from('capacity_overrides')
      .insert({
        center_id: input.centerId,
        program_id: input.programId,
        care_date: careDate,
        override_type: overrideType,
        capacity_override: input.action === 'close' ? 0 : input.capacityOverride,
        reason_code: input.reasonCode,
        reason_text: input.reasonText || null,
        is_active: true,
        created_by_user_id: input.actorUserId,
      })
      .select()
      .single();

    if (insertError || !override) continue;
    overridesCreated++;

    // Get or create program_capacity row for this date
    let { data: cap } = await supabase
      .from('program_capacity')
      .select('id, capacity_total, capacity_reserved, capacity_waitlisted, status')
      .eq('program_id', input.programId)
      .eq('care_date', careDate)
      .single();

    if (!cap) {
      // Lazy-create missing program_capacity row with defaults
      const { data: created } = await supabase
        .from('program_capacity')
        .insert({
          center_id: input.centerId,
          program_id: input.programId,
          care_date: careDate,
          capacity_total: 6,
          capacity_reserved: 0,
          capacity_waitlisted: 0,
          status: 'open',
        })
        .select()
        .single();
      cap = created;
    }

    const previousTotal = cap?.capacity_total ?? 6;
    const previousStatus = cap?.status ?? 'open';
    const reserved = cap?.capacity_reserved ?? 0;

    // Update effective capacity
    const newTotal = input.action === 'close' ? 0 : (input.capacityOverride ?? previousTotal);
    const newStatus = input.action === 'close' ? 'closed' : previousStatus;

    if (cap) {
      await supabase
        .from('program_capacity')
        .update({ capacity_total: newTotal, status: newStatus })
        .eq('id', cap.id);
    }

    if (reserved > newTotal) {
      overCapacityDates.push(careDate);
    }

    // Log deactivation event for prior override if one existed
    if (priorOverride) {
      await supabase.from('capacity_override_events').insert({
        capacity_override_id: priorOverride.id,
        center_id: input.centerId,
        program_id: input.programId,
        care_date: careDate,
        actor_user_id: input.actorUserId,
        event_type: 'capacity_override_deactivated',
        metadata: {
          prior_override_type: priorOverride.override_type,
          prior_capacity_override: priorOverride.capacity_override,
          prior_reason_code: priorOverride.reason_code,
          replaced_by_override_id: override.id,
        },
      });
    }

    // Log new override event
    await supabase.from('capacity_override_events').insert({
      capacity_override_id: override.id,
      center_id: input.centerId,
      program_id: input.programId,
      care_date: careDate,
      actor_user_id: input.actorUserId,
      event_type: eventType,
      metadata: {
        previous_capacity_total: previousTotal,
        new_capacity_total: newTotal,
        previous_status: previousStatus,
        new_status: newStatus,
        affected_bookings: reserved,
        affected_waitlist: cap?.capacity_waitlisted ?? 0,
        reason_code: input.reasonCode,
      },
    });
  }

  return {
    datesProcessed: dates.length,
    overridesCreated,
    overCapacityDates,
  };
}
