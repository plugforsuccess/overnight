BEGIN;

DO $$ BEGIN
  CREATE TYPE public.incident_case_status AS ENUM ('OPEN','UNDER_REVIEW','PARENT_NOTIFIED','RESOLVED','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.care_event_type ADD VALUE IF NOT EXISTS 'parent_notified';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.incident_case_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  incident_id uuid NOT NULL UNIQUE REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES public.parents(id) ON DELETE SET NULL,
  status public.incident_case_status NOT NULL DEFAULT 'OPEN',
  severity text,
  category text,
  parent_notified boolean NOT NULL DEFAULT false,
  parent_notified_at timestamptz,
  parent_acknowledged boolean NOT NULL DEFAULT false,
  parent_acknowledged_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_summary text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incident_case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  case_file_id uuid NOT NULL REFERENCES public.incident_case_files(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note_type text NOT NULL,
  note_body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incident_case_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  case_file_id uuid NOT NULL REFERENCES public.incident_case_files(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_label text NOT NULL,
  action_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_case_files_org_created_at_desc
  ON public.incident_case_files (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_case_files_facility_created_at_desc
  ON public.incident_case_files (facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_case_files_incident_id
  ON public.incident_case_files (incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_case_files_child_created_at_desc
  ON public.incident_case_files (child_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_case_files_status_created_at_desc
  ON public.incident_case_files (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_case_notes_case_file_created_at_asc
  ON public.incident_case_notes (case_file_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_incident_case_notes_facility_created_at_desc
  ON public.incident_case_notes (facility_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_case_actions_case_file_created_at_asc
  ON public.incident_case_actions (case_file_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_incident_case_actions_facility_created_at_desc
  ON public.incident_case_actions (facility_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_incident_case_files_org_facility_match ON public.incident_case_files;
CREATE TRIGGER trg_incident_case_files_org_facility_match
  BEFORE INSERT OR UPDATE ON public.incident_case_files
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

DROP TRIGGER IF EXISTS trg_incident_case_notes_org_facility_match ON public.incident_case_notes;
CREATE TRIGGER trg_incident_case_notes_org_facility_match
  BEFORE INSERT OR UPDATE ON public.incident_case_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();

DROP TRIGGER IF EXISTS trg_incident_case_actions_org_facility_match ON public.incident_case_actions;
CREATE TRIGGER trg_incident_case_actions_org_facility_match
  BEFORE INSERT OR UPDATE ON public.incident_case_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();


CREATE OR REPLACE FUNCTION public.create_incident_case_file_from_incident()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_id uuid;
  v_organization_id uuid;
BEGIN
  SELECT c.parent_id INTO v_parent_id
  FROM public.children c
  WHERE c.id = NEW.child_id;

  SELECT f.organization_id INTO v_organization_id
  FROM public.facilities f
  WHERE f.id = NEW.facility_id;

  INSERT INTO public.incident_case_files (
    organization_id,
    facility_id,
    incident_id,
    child_id,
    parent_id,
    severity,
    category,
    created_by
  ) VALUES (
    v_organization_id,
    NEW.facility_id,
    NEW.id,
    NEW.child_id,
    v_parent_id,
    NEW.severity,
    NEW.category,
    NEW.reported_by
  )
  ON CONFLICT (incident_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incident_reports_create_case_file ON public.incident_reports;
CREATE TRIGGER trg_incident_reports_create_case_file
  AFTER INSERT ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.create_incident_case_file_from_incident();

DROP TRIGGER IF EXISTS incident_case_files_update_timestamp ON public.incident_case_files;
CREATE TRIGGER incident_case_files_update_timestamp
  BEFORE UPDATE ON public.incident_case_files
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

ALTER TABLE public.incident_case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_case_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incident_case_files_select_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_select_policy ON public.incident_case_files
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
  OR EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = incident_case_files.child_id
      AND c.parent_id = auth.uid()
      AND c.facility_id = incident_case_files.facility_id
  )
);

DROP POLICY IF EXISTS incident_case_files_insert_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_insert_policy ON public.incident_case_files
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS incident_case_files_update_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_update_policy ON public.incident_case_files
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
  OR (
    parent_id = auth.uid()
    AND parent_acknowledged = false
  )
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
  OR (parent_id = auth.uid())
);

DROP POLICY IF EXISTS incident_case_notes_select_policy ON public.incident_case_notes;
CREATE POLICY incident_case_notes_select_policy ON public.incident_case_notes
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS incident_case_notes_insert_policy ON public.incident_case_notes;
CREATE POLICY incident_case_notes_insert_policy ON public.incident_case_notes
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS incident_case_actions_select_policy ON public.incident_case_actions;
CREATE POLICY incident_case_actions_select_policy ON public.incident_case_actions
FOR SELECT USING (
  (
    public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
    OR public.has_facility_or_organization_role(
      facility_id,
      ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
      ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
    )
  )
  OR (
    EXISTS (
      SELECT 1
      FROM public.incident_case_files icf
      WHERE icf.id = incident_case_actions.case_file_id
        AND icf.parent_id = auth.uid()
        AND icf.facility_id = incident_case_actions.facility_id
    )
    AND action_type IN ('PARENT_NOTIFIED','PARENT_ACKNOWLEDGED','STATUS_CHANGED')
  )
);

DROP POLICY IF EXISTS incident_case_actions_insert_policy ON public.incident_case_actions;
CREATE POLICY incident_case_actions_insert_policy ON public.incident_case_actions
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

COMMIT;
