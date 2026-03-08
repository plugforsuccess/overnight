import { SupabaseClient } from '@supabase/supabase-js';
import { ensureAttendanceRecord } from './ensure-attendance-record';

export interface NoShowInput {
  reservationNightId: string;
  actorUserId: string;
  reason?: string;
}

/**
 * Mark a child as no-show for a reserved night.
 * Validates: current status must be 'expected'.
 */
export async function markNoShow(
  supabase: SupabaseClient,
  input: NoShowInput
) {
  const record = await ensureAttendanceRecord(supabase, input.reservationNightId);

  if (record.attendance_status !== 'expected') {
    throw new Error(
      `Cannot mark no-show: current status is '${record.attendance_status}'. Expected 'expected'.`
    );
  }

  const now = new Date();

  const { data: updated, error } = await supabase
    .from('attendance_records')
    .update({
      attendance_status: 'no_show',
      no_show_marked_at: now.toISOString(),
      no_show_marked_by_user_id: input.actorUserId,
    })
    .eq('id', record.id)
    .eq('attendance_status', 'expected') // optimistic lock
    .select()
    .single();

  if (error || !updated) {
    throw new Error('No-show marking failed: record may have been modified concurrently.');
  }

  // Emit no-show event
  await supabase.from('attendance_events').insert({
    attendance_record_id: record.id,
    reservation_night_id: input.reservationNightId,
    child_id: record.child_id,
    actor_user_id: input.actorUserId,
    event_type: 'no_show_marked',
    metadata: {
      reason: input.reason || null,
    },
  });

  return updated;
}
