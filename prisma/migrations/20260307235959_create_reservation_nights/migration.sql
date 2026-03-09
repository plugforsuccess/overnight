-- =============================================================================
-- Migration: create reservation_nights
-- Purpose: canonical per-night booking records used by attendance + billing.
-- Added to repair missing table in migration chain.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "reservation_nights" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reservation_id" UUID NOT NULL,
  "child_id" UUID NOT NULL,
  "program_capacity_id" UUID,
  "care_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "capacity_snapshot" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "reservation_nights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_nights_status_check" CHECK (
    "status" IN ('pending', 'confirmed', 'cancelled', 'completed', 'waitlisted', 'no_show')
  ),
  CONSTRAINT "reservation_nights_capacity_snapshot_check" CHECK ("capacity_snapshot" >= 0)
);

-- One child can hold at most one reservation_night on a given date.
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_nights_child_date_unique"
  ON "reservation_nights" ("child_id", "care_date");

-- A reservation can only contain one row per care_date.
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_nights_reservation_date_unique"
  ON "reservation_nights" ("reservation_id", "care_date");

CREATE INDEX IF NOT EXISTS "idx_reservation_nights_reservation"
  ON "reservation_nights" ("reservation_id");

CREATE INDEX IF NOT EXISTS "idx_reservation_nights_date"
  ON "reservation_nights" ("care_date");

-- Prerequisite-safe FKs (tables exist in baseline schema).
ALTER TABLE "reservation_nights"
  ADD CONSTRAINT "reservation_nights_reservation_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE;

ALTER TABLE "reservation_nights"
  ADD CONSTRAINT "reservation_nights_child_fkey"
  FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE;

-- NOTE: program_capacity FK intentionally omitted in this repair migration.
-- program_capacity creation is not guaranteed in the pre-20260308000001 chain.
-- A follow-up migration can safely add:
--   FOREIGN KEY ("program_capacity_id") REFERENCES "program_capacity"("id") ON DELETE SET NULL;
