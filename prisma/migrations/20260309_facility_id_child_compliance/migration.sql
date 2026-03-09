-- Normalize child compliance tables on facility_id
ALTER TABLE child_documents ADD COLUMN IF NOT EXISTS facility_id uuid;
UPDATE child_documents cd
SET facility_id = c.facility_id
FROM children c
WHERE cd.child_id = c.id AND cd.facility_id IS NULL;
ALTER TABLE child_documents ALTER COLUMN facility_id SET NOT NULL;

ALTER TABLE child_immunization_records ADD COLUMN IF NOT EXISTS facility_id uuid;
UPDATE child_immunization_records ir
SET facility_id = c.facility_id
FROM children c
WHERE ir.child_id = c.id AND ir.facility_id IS NULL;
ALTER TABLE child_immunization_records ALTER COLUMN facility_id SET NOT NULL;

ALTER TABLE child_events ALTER COLUMN facility_id SET NOT NULL;
ALTER TABLE child_medical_profiles ALTER COLUMN facility_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE child_documents ADD CONSTRAINT child_documents_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE child_immunization_records ADD CONSTRAINT child_immunization_records_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
