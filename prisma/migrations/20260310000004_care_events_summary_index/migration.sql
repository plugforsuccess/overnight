BEGIN;

ALTER TABLE public.care_events
  ADD COLUMN IF NOT EXISTS event_summary text GENERATED ALWAYS AS (
    CASE event_type
      WHEN 'child_created'::public.care_event_type THEN 'Child created'
      WHEN 'child_profile_updated'::public.care_event_type THEN 'Child profile updated'
      WHEN 'medical_profile_updated'::public.care_event_type THEN 'Medical profile updated'
      WHEN 'allergy_updated'::public.care_event_type THEN 'Allergy profile updated'
      WHEN 'authorized_pickup_added'::public.care_event_type THEN 'Authorized pickup added'
      WHEN 'emergency_contact_added'::public.care_event_type THEN 'Emergency contact added'
      WHEN 'document_uploaded'::public.care_event_type THEN 'Document uploaded'
      WHEN 'document_expired'::public.care_event_type THEN 'Document expired'
      WHEN 'reservation_created'::public.care_event_type THEN 'Reservation created'
      WHEN 'reservation_cancelled'::public.care_event_type THEN 'Reservation cancelled'
      WHEN 'reservation_rebooked'::public.care_event_type THEN 'Reservation rebooked'
      WHEN 'reservation_night_created'::public.care_event_type THEN 'Reservation night created'
      WHEN 'reservation_night_cancelled'::public.care_event_type THEN 'Reservation night cancelled'
      WHEN 'attendance_scheduled'::public.care_event_type THEN 'Attendance scheduled'
      WHEN 'child_checked_in'::public.care_event_type THEN 'Child checked in'
      WHEN 'child_in_care'::public.care_event_type THEN 'Child in care'
      WHEN 'child_ready_for_pickup'::public.care_event_type THEN 'Child ready for pickup'
      WHEN 'child_checked_out'::public.care_event_type THEN 'Child checked out'
      WHEN 'pickup_verification_started'::public.care_event_type THEN 'Pickup verification started'
      WHEN 'pickup_verified'::public.care_event_type THEN 'Pickup verified by staff'
      WHEN 'pickup_denied'::public.care_event_type THEN 'Pickup denied'
      WHEN 'pickup_override_used'::public.care_event_type THEN 'Pickup override used'
      WHEN 'incident_created'::public.care_event_type THEN 'Incident reported'
      WHEN 'incident_updated'::public.care_event_type THEN 'Incident updated'
      WHEN 'incident_resolved'::public.care_event_type THEN 'Incident resolved'
      WHEN 'incident_acknowledged_by_parent'::public.care_event_type THEN 'Incident acknowledged by parent'
      WHEN 'admin_override_used'::public.care_event_type THEN 'Admin override used'
      WHEN 'record_archived'::public.care_event_type THEN 'Record archived'
      WHEN 'record_restored'::public.care_event_type THEN 'Record restored'
      ELSE 'Care event'
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_care_events_child_timeline
  ON public.care_events (child_id, created_at DESC)
  WHERE child_id IS NOT NULL;

COMMIT;
