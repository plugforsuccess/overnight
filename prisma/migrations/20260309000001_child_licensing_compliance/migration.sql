-- Child Licensing Compliance Migration
-- Adds: child_documents, child_immunization_records,
--        medication_authorizations, medication_administration_logs
-- Fixes: children.date_of_birth NOT NULL enforcement

-- ============================================================
-- child_documents
-- ============================================================
CREATE TABLE "child_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "document_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "uploaded_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "child_documents_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "child_documents_type_check" CHECK (
        "document_type" IN ('immunization_certificate', 'medication_authorization', 'photo_id', 'consent_form', 'other')
    ),

    CONSTRAINT "child_documents_child_id_fkey"
        FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_child_documents_child_type" ON "child_documents"("child_id", "document_type");

-- ============================================================
-- child_immunization_records
-- ============================================================
CREATE TABLE "child_immunization_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'missing',
    "document_url" TEXT,
    "document_path" TEXT,
    "issued_date" DATE,
    "expires_at" DATE,
    "exemption_reason" TEXT,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "child_immunization_records_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "child_immunization_records_status_check" CHECK (
        "status" IN ('current', 'expired', 'exempt_medical', 'exempt_religious', 'missing')
    ),

    CONSTRAINT "child_immunization_records_child_id_key" UNIQUE ("child_id"),

    CONSTRAINT "child_immunization_records_child_id_fkey"
        FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- medication_authorizations
-- ============================================================
CREATE TABLE "medication_authorizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "child_id" UUID NOT NULL,
    "center_id" UUID,
    "medication_name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "special_instructions" TEXT,
    "prescribing_physician" TEXT,
    "parent_consent_name" TEXT,
    "parent_consent_signed_at" TIMESTAMPTZ(6),
    "document_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "medication_authorizations_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "medication_authorizations_route_check" CHECK (
        "route" IN ('oral', 'topical', 'inhaled', 'injection', 'other')
    ),

    CONSTRAINT "medication_authorizations_child_id_fkey"
        FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_med_auth_child_active" ON "medication_authorizations"("child_id", "is_active");

-- ============================================================
-- medication_administration_logs
-- ============================================================
CREATE TABLE "medication_administration_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "medication_authorization_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "administered_at" TIMESTAMPTZ(6) NOT NULL,
    "administered_by" UUID NOT NULL,
    "dose_given" TEXT NOT NULL,
    "notes" TEXT,
    "parent_notified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "medication_administration_logs_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "medication_administration_logs_auth_fkey"
        FOREIGN KEY ("medication_authorization_id") REFERENCES "medication_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_med_admin_child_time" ON "medication_administration_logs"("child_id", "administered_at");

-- ============================================================
-- updated_at triggers for new tables
-- ============================================================
CREATE TRIGGER set_updated_at_child_documents
    BEFORE UPDATE ON "child_documents"
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_child_immunization_records
    BEFORE UPDATE ON "child_immunization_records"
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER set_updated_at_medication_authorizations
    BEFORE UPDATE ON "medication_authorizations"
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
