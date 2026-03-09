import { SupabaseClient } from '@supabase/supabase-js';

const VALID_STATUSES = ['expected', 'checked_in', 'checked_out', 'no_show', 'cancelled'] as const;
type AttendanceStatus = typeof VALID_STATUSES[number];

export interface CorrectionInput {
  attendanceRecordId: string;
  actorUserId: string;
  newStatus: string;
  reason: string;
}

/**
 * Correct an attendance record's status (admin-only).
 * Used for staff mistakes — records the previous state in the event log.
 */
export async function correctAttendanceStatus(
  supabase: SupabaseClient,
  input: CorrectionInput
) {
  if (!input.reason || input.reason.trim().length < 3) {
    throw new Error('A reason is required for attendance corrections.');
  }

  if (!VALID_STATUSES.includes(input.newStatus as AttendanceStatus)) {
    throw new Error(`Invalid status: ${input.newStatus}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Fetch current record
  const { data: record, error: fetchError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', input.attendanceRecordId)
    .single();

  if (fetchError || !record) {
    throw new Error('Attendance record not found.');
  }

  const previousStatus = record.attendance_status;

  if (previousStatus === input.newStatus) {
    throw new Error(`Status is already '${input.newStatus}'. No change needed.`);
  }

  // Update the record
  const updateFields: Record<string, any> = {
    attendance_status: input.newStatus,
  };

  // Reset relevant fields based on new status
  if (input.newStatus === 'expected') {
    updateFields.checked_in_at = null;
    updateFields.checked_in_by_user_id = null;
    updateFields.checked_out_at = null;
    updateFields.checked_out_by_user_id = null;
    updateFields.no_show_marked_at = null;
    updateFields.no_show_marked_by_user_id = null;
    updateFields.late_arrival_minutes = 0;
  }

  const { data: updated, error: updateError } = await supabase
    .from('attendance_records')
    .update(updateFields)
    .eq('id', input.attendanceRecordId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new Error(`Correction failed: ${updateError?.message || 'unknown error'}`);
  }

  // Emit correction event with full audit trail
  await supabase.from('attendance_events').insert({
    attendance_record_id: record.id,
    reservation_night_id: record.reservation_night_id,
    child_id: record.child_id,
    actor_user_id: input.actorUserId,
    event_type: 'attendance_status_corrected',
    metadata: {
      previous_status: previousStatus,
      new_status: input.newStatus,
      reason: input.reason.trim(),
    },
  });

  return updated;
}
