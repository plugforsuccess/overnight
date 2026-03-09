BEGIN;

-- child_documents: add facility_id, backfill from children, enforce FK + NOT NULL
ALTER TABLE public.child_documents
  ADD COLUMN IF NOT EXISTS facility_id uuid;

UPDATE public.child_documents d
SET facility_id = c.facility_id
FROM public.children c
WHERE d.child_id = c.id
  AND d.facility_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_documents_facility_id_fkey') THEN
    ALTER TABLE public.child_documents
      ADD CONSTRAINT child_documents_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_child_documents_facility_id
  ON public.child_documents (facility_id);

ALTER TABLE public.child_documents
  ALTER COLUMN facility_id SET NOT NULL;

-- child_immunization_records: add facility_id, backfill from children, enforce FK + NOT NULL
ALTER TABLE public.child_immunization_records
  ADD COLUMN IF NOT EXISTS facility_id uuid;

UPDATE public.child_immunization_records r
SET facility_id = c.facility_id
FROM public.children c
WHERE r.child_id = c.id
  AND r.facility_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_immunization_records_facility_id_fkey') THEN
    ALTER TABLE public.child_immunization_records
      ADD CONSTRAINT child_immunization_records_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_child_immunization_records_facility_id
  ON public.child_immunization_records (facility_id);

ALTER TABLE public.child_immunization_records
  ALTER COLUMN facility_id SET NOT NULL;

-- child_medical_profiles: ensure backfill + constraint hardening on facility_id
UPDATE public.child_medical_profiles m
SET facility_id = c.facility_id
FROM public.children c
WHERE m.child_id = c.id
  AND m.facility_id IS NULL;

ALTER TABLE public.child_medical_profiles
  ALTER COLUMN facility_id SET NOT NULL;

-- child_events: ensure backfill + constraint hardening on facility_id
UPDATE public.child_events e
SET facility_id = c.facility_id
FROM public.children c
WHERE e.child_id = c.id
  AND e.facility_id IS NULL;

ALTER TABLE public.child_events
  ALTER COLUMN facility_id SET NOT NULL;

COMMIT;
