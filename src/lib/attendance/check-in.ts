import { SupabaseClient } from '@supabase/supabase-js';
import { ensureAttendanceRecord } from './ensure-attendance-record';
import { OVERNIGHT_START } from '@/lib/constants';
import { writeCareEvent } from '@/lib/care-events';

export interface CheckInInput {
  reservationNightId: string;
  actorUserId: string;
  arrivalNotes?: string;
  checkInMethod?: string;
}

/**
 * Check in a child for a reserved night.
 * Validates: current status must be 'expected'.
 * Sets checked_in_at, computes late arrival if applicable.
 */
export async function checkInChild(
  supabase: SupabaseClient,
  input: CheckInInput
) {
  const record = await ensureAttendanceRecord(supabase, input.reservationNightId);

  if (record.attendance_status !== 'expected') {
    throw new Error(
      `Cannot check in: current status is '${record.attendance_status}'. Expected 'expected'.`
    );
  }

  const now = new Date();
  const method = input.checkInMethod || 'staff_manual';

  // Compute late arrival minutes
  // Expected arrival is typically OVERNIGHT_START (e.g., 9:00 PM) on the care date
  let lateMinutes = 0;
  if (record.expected_arrival_at) {
    const expectedMs = new Date(record.expected_arrival_at).getTime();
    const diffMs = now.getTime() - expectedMs;
    if (diffMs > 0) {
      lateMinutes = Math.ceil(diffMs / 60000);
    }
  }

  // Update the record
  const { data: updated, error } = await supabase
    .from('attendance_records')
    .update({
      attendance_status: 'checked_in',
      checked_in_at: now.toISOString(),
      checked_in_by_user_id: input.actorUserId,
      check_in_method: method,
      arrival_notes: input.arrivalNotes || record.arrival_notes,
      late_arrival_minutes: lateMinutes,
    })
    .eq('id', record.id)
    .eq('attendance_status', 'expected') // optimistic lock
    .select()
    .single();

  if (error || !updated) {
    throw new Error('Check-in failed: record may have been modified concurrently.');
  }

  // Emit check-in event
  await supabase.from('attendance_events').insert({
    attendance_record_id: record.id,
    reservation_night_id: input.reservationNightId,
    child_id: record.child_id,
    actor_user_id: input.actorUserId,
    event_type: 'child_checked_in',
    metadata: {
      check_in_method: method,
      arrival_notes: input.arrivalNotes || null,
      late_arrival_minutes: lateMinutes,
    },
  });


  await writeCareEvent({
    eventType: 'child_checked_in',
    actorType: 'STAFF',
    actorUserId: input.actorUserId,
    facilityId: updated.facility_id,
    childId: updated.child_id,
    reservationNightId: input.reservationNightId,
    metadata: { check_in_method: method, late_arrival_minutes: lateMinutes },
  });

  await writeCareEvent({
    eventType: 'child_in_care',
    actorType: 'SYSTEM',
    facilityId: updated.facility_id,
    childId: updated.child_id,
    reservationNightId: input.reservationNightId,
    metadata: { source: 'check_in_transition' },
  });

  // Emit late arrival event if applicable
  if (lateMinutes > 0) {
    await supabase.from('attendance_events').insert({
      attendance_record_id: record.id,
      reservation_night_id: input.reservationNightId,
      child_id: record.child_id,
      actor_user_id: input.actorUserId,
      event_type: 'late_arrival_recorded',
      metadata: { late_minutes: lateMinutes },
    });
  }

  return updated;
}
