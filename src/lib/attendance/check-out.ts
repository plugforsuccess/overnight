import { SupabaseClient } from '@supabase/supabase-js';
import { ensureAttendanceRecord } from './ensure-attendance-record';

export interface CheckOutInput {
  reservationNightId: string;
  actorUserId: string;
  pickupId?: string;
  pickupVerificationStatus?: string;
  departureNotes?: string;
  checkOutMethod?: string;
}

/**
 * Check out a child from a reserved night.
 * Validates: current status must be 'checked_in'.
 * Records pickup verification if applicable.
 */
export async function checkOutChild(
  supabase: SupabaseClient,
  input: CheckOutInput
) {
  const record = await ensureAttendanceRecord(supabase, input.reservationNightId);

  if (record.attendance_status !== 'checked_in') {
    throw new Error(
      `Cannot check out: current status is '${record.attendance_status}'. Expected 'checked_in'.`
    );
  }

  const now = new Date();
  const method = input.checkOutMethod || 'staff_manual';
  const verificationStatus = input.pickupVerificationStatus || (input.pickupId ? 'pending' : 'not_applicable');

  const { data: updated, error } = await supabase
    .from('attendance_records')
    .update({
      attendance_status: 'checked_out',
      checked_out_at: now.toISOString(),
      checked_out_by_user_id: input.actorUserId,
      check_out_method: method,
      checked_out_to_pickup_id: input.pickupId || null,
      pickup_verification_status: verificationStatus,
      departure_notes: input.departureNotes || record.departure_notes,
    })
    .eq('id', record.id)
    .eq('attendance_status', 'checked_in') // optimistic lock
    .select()
    .single();

  if (error || !updated) {
    throw new Error('Check-out failed: record may have been modified concurrently.');
  }

  // Emit check-out event
  await supabase.from('attendance_events').insert({
    attendance_record_id: record.id,
    reservation_night_id: input.reservationNightId,
    child_id: record.child_id,
    actor_user_id: input.actorUserId,
    event_type: 'child_checked_out',
    metadata: {
      check_out_method: method,
      pickup_id: input.pickupId || null,
      pickup_verification_status: verificationStatus,
      departure_notes: input.departureNotes || null,
    },
  });

  // Emit pickup verification event if pickup was specified
  if (input.pickupId && verificationStatus === 'verified') {
    await supabase.from('attendance_events').insert({
      attendance_record_id: record.id,
      reservation_night_id: input.reservationNightId,
      child_id: record.child_id,
      actor_user_id: input.actorUserId,
      event_type: 'pickup_verified',
      metadata: {
        pickup_id: input.pickupId,
        verification_status: verificationStatus,
      },
    });
  }

  return updated;
}
