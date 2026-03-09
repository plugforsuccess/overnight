BEGIN;

DO $$
BEGIN
  CREATE TYPE public.care_event_type AS ENUM (
    'child_created',
    'child_profile_updated',
    'medical_profile_updated',
    'allergy_updated',
    'authorized_pickup_added',
    'emergency_contact_added',
    'document_uploaded',
    'document_expired',
    'reservation_created',
    'reservation_cancelled',
    'reservation_rebooked',
    'reservation_night_created',
    'reservation_night_cancelled',
    'attendance_scheduled',
    'child_checked_in',
    'child_in_care',
    'child_ready_for_pickup',
    'child_checked_out',
    'pickup_verification_started',
    'pickup_verified',
    'pickup_denied',
    'pickup_override_used',
    'incident_created',
    'incident_updated',
    'incident_resolved',
    'incident_acknowledged_by_parent',
    'admin_override_used',
    'record_archived',
    'record_restored'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.actor_type AS ENUM ('PARENT', 'STAFF', 'FACILITY_ADMIN', 'ORG_ADMIN', 'PLATFORM_ADMIN', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.care_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  child_id uuid NULL REFERENCES public.children(id) ON DELETE SET NULL,
  parent_id uuid NULL REFERENCES public.parents(id) ON DELETE SET NULL,
  reservation_id uuid NULL REFERENCES public.reservations(id) ON DELETE SET NULL,
  reservation_night_id uuid NULL REFERENCES public.reservation_nights(id) ON DELETE SET NULL,
  attendance_session_id uuid NULL REFERENCES public.child_attendance_sessions(id) ON DELETE SET NULL,
  pickup_verification_id uuid NULL REFERENCES public.pickup_verifications(id) ON DELETE SET NULL,
  incident_id uuid NULL REFERENCES public.incident_reports(id) ON DELETE SET NULL,
  event_type public.care_event_type NOT NULL,
  actor_type public.actor_type NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NULL,
  event_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_events_event_metadata_is_object CHECK (jsonb_typeof(event_metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_care_events_org_created_at_desc ON public.care_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_events_facility_created_at_desc ON public.care_events (facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_events_child_created_at_desc ON public.care_events (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_events_reservation_created_at_desc ON public.care_events (reservation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_events_incident_created_at_desc ON public.care_events (incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_events_type_created_at_desc ON public.care_events (event_type, created_at DESC);

DROP TRIGGER IF EXISTS trg_care_events_org_facility_match ON public.care_events;
CREATE TRIGGER trg_care_events_org_facility_match
  BEFORE INSERT OR UPDATE ON public.care_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

CREATE OR REPLACE FUNCTION public.prevent_care_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'care_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_care_events_no_update ON public.care_events;
CREATE TRIGGER trg_care_events_no_update
  BEFORE UPDATE ON public.care_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_care_events_mutation();

DROP TRIGGER IF EXISTS trg_care_events_no_delete ON public.care_events;
CREATE TRIGGER trg_care_events_no_delete
  BEFORE DELETE ON public.care_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_care_events_mutation();

ALTER TABLE public.care_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_events_parent_read_own_children ON public.care_events;
CREATE POLICY care_events_parent_read_own_children ON public.care_events
FOR SELECT USING (
  child_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = care_events.child_id
      AND c.parent_id = auth.uid()
      AND c.facility_id = care_events.facility_id
  )
);

DROP POLICY IF EXISTS care_events_facility_staff_read ON public.care_events;
CREATE POLICY care_events_facility_staff_read ON public.care_events
FOR SELECT USING (
  public.has_facility_role(care_events.facility_id, ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[])
);

DROP POLICY IF EXISTS care_events_org_read ON public.care_events;
CREATE POLICY care_events_org_read ON public.care_events
FOR SELECT USING (
  public.has_organization_role(care_events.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[])
);

DROP POLICY IF EXISTS care_events_platform_read ON public.care_events;
CREATE POLICY care_events_platform_read ON public.care_events
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
);

DROP POLICY IF EXISTS care_events_service_insert_only ON public.care_events;
CREATE POLICY care_events_service_insert_only ON public.care_events
FOR INSERT WITH CHECK (auth.role() = 'service_role');

COMMIT;
