BEGIN;

DO $$ BEGIN
  CREATE TYPE public.staff_shift_role AS ENUM ('DIRECTOR','STAFF','CAREGIVER','SUPERVISOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.staff_task_status AS ENUM ('OPEN','IN_PROGRESS','DONE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.staff_task_type AS ENUM ('CHECKIN','CHECKOUT','PICKUP','INCIDENT_FOLLOWUP','DOCUMENT_REVIEW','MEDICATION','HANDOFF','GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'staff_shift_created';
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'child_assignment_created';
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'child_assignment_released';
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'shift_handoff_note_created';
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'staff_task_created';
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'staff_task_completed';
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'staff_task_cancelled';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  shift_role public.staff_shift_role NOT NULL,
  shift_start timestamptz NOT NULL,
  shift_end timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_shifts_shift_end_after_start CHECK (shift_end > shift_start)
);

CREATE TABLE IF NOT EXISTS public.child_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_assignments_release_after_assign CHECK (released_at IS NULL OR released_at >= assigned_at)
);

CREATE TABLE IF NOT EXISTS public.shift_handoff_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  child_id uuid NULL REFERENCES public.children(id) ON DELETE SET NULL,
  assigned_to uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  task_type public.staff_task_type NOT NULL,
  description text NOT NULL,
  status public.staff_task_status NOT NULL DEFAULT 'OPEN',
  due_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_tasks_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_facility_shift_start_desc ON public.staff_shifts (facility_id, shift_start DESC);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff_shift_start_desc ON public.staff_shifts (staff_user_id, shift_start DESC);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_org_facility_shift_start_desc ON public.staff_shifts (organization_id, facility_id, shift_start DESC);

CREATE INDEX IF NOT EXISTS idx_child_assignments_facility_child_assigned_at_desc ON public.child_assignments (facility_id, child_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_assignments_facility_staff_assigned_at_desc ON public.child_assignments (facility_id, staff_user_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_assignments_active_facility_child ON public.child_assignments (facility_id, child_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_child_assignments_active_facility_staff ON public.child_assignments (facility_id, staff_user_id) WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shift_handoff_notes_shift_created_at_asc ON public.shift_handoff_notes (shift_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_shift_handoff_notes_facility_created_at_desc ON public.shift_handoff_notes (facility_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_facility_status_created_at_desc ON public.staff_tasks (facility_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_assigned_status_created_at_desc ON public.staff_tasks (assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_child_created_at_desc ON public.staff_tasks (child_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_staff_shifts_org_facility_match ON public.staff_shifts;
CREATE TRIGGER trg_staff_shifts_org_facility_match
  BEFORE INSERT OR UPDATE ON public.staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

DROP TRIGGER IF EXISTS trg_child_assignments_org_facility_match ON public.child_assignments;
CREATE TRIGGER trg_child_assignments_org_facility_match
  BEFORE INSERT OR UPDATE ON public.child_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

DROP TRIGGER IF EXISTS trg_shift_handoff_notes_org_facility_match ON public.shift_handoff_notes;
CREATE TRIGGER trg_shift_handoff_notes_org_facility_match
  BEFORE INSERT OR UPDATE ON public.shift_handoff_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

DROP TRIGGER IF EXISTS trg_staff_tasks_org_facility_match ON public.staff_tasks;
CREATE TRIGGER trg_staff_tasks_org_facility_match
  BEFORE INSERT OR UPDATE ON public.staff_tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

DROP TRIGGER IF EXISTS staff_shifts_update_timestamp ON public.staff_shifts;
CREATE TRIGGER staff_shifts_update_timestamp
  BEFORE UPDATE ON public.staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS staff_tasks_update_timestamp ON public.staff_tasks;
CREATE TRIGGER staff_tasks_update_timestamp
  BEFORE UPDATE ON public.staff_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handoff_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_shifts_select_policy ON public.staff_shifts;
CREATE POLICY staff_shifts_select_policy ON public.staff_shifts
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS staff_shifts_insert_policy ON public.staff_shifts;
CREATE POLICY staff_shifts_insert_policy ON public.staff_shifts
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS staff_shifts_update_policy ON public.staff_shifts;
CREATE POLICY staff_shifts_update_policy ON public.staff_shifts
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS child_assignments_select_policy ON public.child_assignments;
CREATE POLICY child_assignments_select_policy ON public.child_assignments
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS child_assignments_insert_policy ON public.child_assignments;
CREATE POLICY child_assignments_insert_policy ON public.child_assignments
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS child_assignments_update_policy ON public.child_assignments;
CREATE POLICY child_assignments_update_policy ON public.child_assignments
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS shift_handoff_notes_select_policy ON public.shift_handoff_notes;
CREATE POLICY shift_handoff_notes_select_policy ON public.shift_handoff_notes
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS shift_handoff_notes_insert_policy ON public.shift_handoff_notes;
CREATE POLICY shift_handoff_notes_insert_policy ON public.shift_handoff_notes
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS staff_tasks_select_policy ON public.staff_tasks;
CREATE POLICY staff_tasks_select_policy ON public.staff_tasks
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS staff_tasks_insert_policy ON public.staff_tasks;
CREATE POLICY staff_tasks_insert_policy ON public.staff_tasks
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS staff_tasks_update_policy ON public.staff_tasks;
CREATE POLICY staff_tasks_update_policy ON public.staff_tasks
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

COMMIT;
