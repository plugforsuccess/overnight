import { supabaseAdmin } from '@/lib/supabase-server';

export type CareEventType =
  | 'child_created'
  | 'child_profile_updated'
  | 'medical_profile_updated'
  | 'allergy_updated'
  | 'authorized_pickup_added'
  | 'emergency_contact_added'
  | 'document_uploaded'
  | 'document_expired'
  | 'reservation_created'
  | 'reservation_cancelled'
  | 'reservation_rebooked'
  | 'reservation_night_created'
  | 'reservation_night_cancelled'
  | 'attendance_scheduled'
  | 'child_checked_in'
  | 'child_in_care'
  | 'child_ready_for_pickup'
  | 'child_checked_out'
  | 'pickup_verification_started'
  | 'pickup_verified'
  | 'pickup_denied'
  | 'pickup_override_used'
  | 'incident_created'
  | 'incident_updated'
  | 'incident_resolved'
  | 'incident_acknowledged_by_parent'
  | 'admin_override_used'
  | 'record_archived'
  | 'record_restored';

export type ActorType = 'PARENT' | 'STAFF' | 'FACILITY_ADMIN' | 'ORG_ADMIN' | 'PLATFORM_ADMIN' | 'SYSTEM';

type WriteCareEventInput = {
  eventType: CareEventType;
  actorType: ActorType;
  actorUserId?: string | null;
  actorLabel?: string | null;
  facilityId: string;
  organizationId?: string;
  childId?: string | null;
  parentId?: string | null;
  reservationId?: string | null;
  reservationNightId?: string | null;
  attendanceSessionId?: string | null;
  pickupVerificationId?: string | null;
  incidentId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeCareEvent(input: WriteCareEventInput) {
  const { data: facility, error: facilityError } = await supabaseAdmin
    .from('facilities')
    .select('organization_id')
    .eq('id', input.facilityId)
    .single();

  if (facilityError || !facility?.organization_id) {
    throw new Error(`Could not resolve organization for facility ${input.facilityId}`);
  }

  const resolvedOrgId = input.organizationId ?? facility.organization_id;
  if (resolvedOrgId !== facility.organization_id) {
    throw new Error('organization_id does not match facility organization');
  }

  const payload = {
    organization_id: resolvedOrgId,
    facility_id: input.facilityId,
    child_id: input.childId ?? null,
    parent_id: input.parentId ?? null,
    reservation_id: input.reservationId ?? null,
    reservation_night_id: input.reservationNightId ?? null,
    attendance_session_id: input.attendanceSessionId ?? null,
    pickup_verification_id: input.pickupVerificationId ?? null,
    incident_id: input.incidentId ?? null,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_user_id: input.actorUserId ?? null,
    actor_label: input.actorLabel ?? null,
    event_metadata: input.metadata ?? {},
  };

  const { error } = await supabaseAdmin.from('care_events').insert(payload);
  if (error) throw error;
}
