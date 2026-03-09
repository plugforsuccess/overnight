BEGIN;

-- Guardrail helper for current and future operational tables that carry both
-- organization_id and facility_id.
--
-- Usage on a table that contains both columns:
--   CREATE TRIGGER trg_<table>_org_facility_match
--   BEFORE INSERT OR UPDATE ON public.<table>
--   FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();
CREATE OR REPLACE FUNCTION public.enforce_organization_matches_facility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  facility_org_id uuid;
BEGIN
  IF NEW.facility_id IS NULL OR NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'facility_id and organization_id are required together on %', TG_TABLE_NAME;
  END IF;

  SELECT f.organization_id
    INTO facility_org_id
  FROM public.facilities f
  WHERE f.id = NEW.facility_id;

  IF facility_org_id IS NULL THEN
    RAISE EXCEPTION 'Invalid facility_id % on %', NEW.facility_id, TG_TABLE_NAME;
  END IF;

  IF facility_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'organization_id % does not match facilities.organization_id % for facility_id % on %',
      NEW.organization_id,
      facility_org_id,
      NEW.facility_id,
      TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
