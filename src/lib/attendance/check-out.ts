import { SupabaseClient } from '@supabase/supabase-js';
import { ensureAttendanceRecord } from './ensure-attendance-record';
import { writeCareEvent } from '@/lib/care-events';

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

  // Validate pickup verification status against allowed values
  const validPickupStatuses = ['not_applicable', 'pending', 'verified', 'failed', 'manual_override'];
  if (!validPickupStatuses.includes(verificationStatus)) {
    throw new Error(`Invalid pickup verification status: '${verificationStatus}'. Must be one of: ${validPickupStatuses.join(', ')}`);
  }

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


  await writeCareEvent({
    eventType: 'child_ready_for_pickup',
    actorType: 'STAFF',
    actorUserId: input.actorUserId,
    facilityId: updated.facility_id,
    childId: updated.child_id,
    reservationNightId: input.reservationNightId,
    metadata: { pickup_verification_status: verificationStatus },
  });

  await writeCareEvent({
    eventType: 'child_checked_out',
    actorType: 'STAFF',
    actorUserId: input.actorUserId,
    facilityId: updated.facility_id,
    childId: updated.child_id,
    reservationNightId: input.reservationNightId,
    metadata: { check_out_method: method },
  });

  if (verificationStatus === 'manual_override') {
    await writeCareEvent({
      eventType: 'pickup_override_used',
      actorType: 'FACILITY_ADMIN',
      actorUserId: input.actorUserId,
      facilityId: updated.facility_id,
      childId: updated.child_id,
      reservationNightId: input.reservationNightId,
      metadata: { reason: 'manual_override' },
    });
  }

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
