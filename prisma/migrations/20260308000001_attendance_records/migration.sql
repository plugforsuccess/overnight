-- =============================================================================
-- Migration: attendance_records + attendance_events
-- Purpose: First-class attendance domain model, 1:1 with reservation_nights
-- =============================================================================

-- ─── attendance_records ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id"                         UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_night_id"       UUID NOT NULL,
    "center_id"                  UUID,
    "child_id"                   UUID NOT NULL,
    "parent_id"                  UUID NOT NULL,
    "care_date"                  DATE NOT NULL,
    "attendance_status"          TEXT NOT NULL DEFAULT 'expected',
    "expected_arrival_at"        TIMESTAMPTZ(6),
    "checked_in_at"              TIMESTAMPTZ(6),
    "checked_in_by_user_id"      UUID,
    "check_in_method"            TEXT,
    "arrival_notes"              TEXT,
    "expected_departure_at"      TIMESTAMPTZ(6),
    "checked_out_at"             TIMESTAMPTZ(6),
    "checked_out_by_user_id"     UUID,
    "check_out_method"           TEXT,
    "checked_out_to_pickup_id"   UUID,
    "pickup_verification_status" TEXT,
    "departure_notes"            TEXT,
    "no_show_marked_at"          TIMESTAMPTZ(6),
    "no_show_marked_by_user_id"  UUID,
    "cancellation_after_cutoff"  BOOLEAN NOT NULL DEFAULT false,
    "late_arrival_minutes"       INTEGER NOT NULL DEFAULT 0,
    "created_at"                 TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"                 TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- One attendance record per reservation night
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_reservation_night_unique"
    UNIQUE ("reservation_night_id");

-- FK to reservation_nights
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_reservation_night_fkey"
    FOREIGN KEY ("reservation_night_id")
    REFERENCES "reservation_nights"("id")
    ON DELETE CASCADE;

-- CHECK: allowed attendance status values
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_status_check"
    CHECK ("attendance_status" IN ('expected', 'checked_in', 'checked_out', 'no_show', 'cancelled'));

-- CHECK: late_arrival_minutes must be non-negative
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_late_arrival_check"
    CHECK ("late_arrival_minutes" >= 0);

-- CHECK: if checked_out_at is set, checked_in_at must also be set and checkout >= checkin
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_checkout_after_checkin_check"
    CHECK (
        "checked_out_at" IS NULL
        OR ("checked_in_at" IS NOT NULL AND "checked_out_at" >= "checked_in_at")
    );

-- CHECK: check_in_method values
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_checkin_method_check"
    CHECK (
        "check_in_method" IS NULL
        OR "check_in_method" IN ('staff_manual', 'parent_acknowledged', 'system', 'override')
    );

-- CHECK: check_out_method values
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_checkout_method_check"
    CHECK (
        "check_out_method" IS NULL
        OR "check_out_method" IN ('staff_manual', 'parent_acknowledged', 'system', 'override')
    );

-- CHECK: pickup_verification_status values
ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_pickup_status_check"
    CHECK (
        "pickup_verification_status" IS NULL
        OR "pickup_verification_status" IN ('not_applicable', 'pending', 'verified', 'failed', 'manual_override')
    );

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_attendance_records_center_date"
    ON "attendance_records"("center_id", "care_date");
CREATE INDEX IF NOT EXISTS "idx_attendance_records_child_date"
    ON "attendance_records"("child_id", "care_date");
CREATE INDEX IF NOT EXISTS "idx_attendance_records_status_date"
    ON "attendance_records"("attendance_status", "care_date");
CREATE INDEX IF NOT EXISTS "idx_attendance_records_parent"
    ON "attendance_records"("parent_id");


-- ─── attendance_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "attendance_events" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_record_id" UUID NOT NULL,
    "reservation_night_id" UUID NOT NULL,
    "center_id"            UUID,
    "child_id"             UUID NOT NULL,
    "actor_user_id"        UUID,
    "event_type"           TEXT NOT NULL,
    "event_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "metadata"             JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- FK to attendance_records
ALTER TABLE "attendance_events"
    ADD CONSTRAINT "attendance_events_record_fkey"
    FOREIGN KEY ("attendance_record_id")
    REFERENCES "attendance_records"("id")
    ON DELETE CASCADE;

-- CHECK: allowed event types
ALTER TABLE "attendance_events"
    ADD CONSTRAINT "attendance_events_type_check"
    CHECK ("event_type" IN (
        'attendance_record_created',
        'child_checked_in',
        'late_arrival_recorded',
        'child_checked_out',
        'pickup_verified',
        'pickup_verification_failed',
        'no_show_marked',
        'attendance_status_corrected',
        'attendance_cancelled'
    ));

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_attendance_events_record"
    ON "attendance_events"("attendance_record_id", "event_at");
CREATE INDEX IF NOT EXISTS "idx_attendance_events_night"
    ON "attendance_events"("reservation_night_id", "event_at");
CREATE INDEX IF NOT EXISTS "idx_attendance_events_center"
    ON "attendance_events"("center_id", "event_at");
CREATE INDEX IF NOT EXISTS "idx_attendance_events_type"
    ON "attendance_events"("event_type", "event_at");
