BEGIN;

CREATE OR REPLACE FUNCTION public.parent_acknowledge_incident_case_file(
  p_incident_id uuid,
  p_facility_id uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  case_file_id uuid,
  organization_id uuid,
  facility_id uuid,
  child_id uuid,
  parent_id uuid,
  acknowledged_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.incident_case_files%ROWTYPE;
  v_ack_at timestamptz := now();
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT icf.*
    INTO v_case
  FROM public.incident_case_files icf
  WHERE icf.incident_id = p_incident_id
    AND icf.facility_id = p_facility_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident case file not found in facility scope';
  END IF;

  IF v_case.parent_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'Incident is not parent-owned';
  END IF;

  UPDATE public.incident_case_files
  SET parent_acknowledged = true,
      parent_acknowledged_at = COALESCE(parent_acknowledged_at, v_ack_at),
      updated_at = now()
  WHERE id = v_case.id;

  INSERT INTO public.incident_case_actions (
    organization_id,
    facility_id,
    case_file_id,
    action_type,
    action_label,
    action_metadata,
    performed_by
  ) VALUES (
    v_case.organization_id,
    v_case.facility_id,
    v_case.id,
    'PARENT_ACKNOWLEDGED',
    'Parent acknowledged incident',
    jsonb_build_object('acknowledged_at', v_ack_at),
    p_actor_user_id
  );

  RETURN QUERY
  SELECT
    v_case.id,
    v_case.organization_id,
    v_case.facility_id,
    v_case.child_id,
    v_case.parent_id,
    v_ack_at;
END;
$$;

REVOKE ALL ON FUNCTION public.parent_acknowledge_incident_case_file(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_acknowledge_incident_case_file(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS incident_case_files_update_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_update_policy ON public.incident_case_files
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

COMMIT;
