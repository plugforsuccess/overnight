-- ============================================================
-- Migration: 20260307000004_sprint_hardening
--
-- Depends on:
--   20260307000003_operational_hardening
--
-- Required objects created by 000003:
--   Tables:
--     reservation_events
--     incident_reports
--     center_staff_memberships
--     pickup_verifications
--   Functions:
--     enforce_attendance_transition()
--
-- This migration ALTERs tables from 000003 (adds archived_at columns,
-- attaches triggers). If those tables do not exist, every ALTER TABLE
-- and CREATE TRIGGER referencing them will fail.
--
-- IMPORTANT:
-- If this migration fails with "relation does not exist" errors,
-- the most common cause is metadata drift — where 000003 is marked
-- APPLIED in _prisma_migrations but its objects were never created.
-- This happened in the 2026-03-07 production incident.
--
-- Diagnose with:
--   npm run migrate:check
--
-- If drift is detected, follow docs/prisma-migration-recovery.md
-- Scenario D to delete the stale row and redeploy. Do NOT simply
-- re-run prisma migrate resolve --rolled-back on 000003 — that
-- adds a new rolled-back row but does not remove the stale applied
-- row, so Prisma will still skip re-running 000003.
-- ============================================================

-- ============================================================
-- 1. Idempotency Keys Table
-- ============================================================
-- Stores idempotency keys for critical POST/PATCH APIs.
-- Keys expire after 24 hours via the expires_at column.
-- Clients send Idempotency-Key header; duplicate requests return cached response.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key text PRIMARY KEY,
  user_id uuid,
  request_path text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON public.idempotency_keys (expires_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user
  ON public.idempotency_keys (user_id);

-- RLS: idempotency_keys are managed by the service role only
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — only supabaseAdmin (service role) accesses this table.
-- Service role bypasses RLS by default.

-- ============================================================
-- 2. Booking Deduplication Constraint
-- ============================================================
-- Prevent the same child from having two active overnight_blocks for the same week.
-- Only one active block per child per week_start is allowed.

CREATE UNIQUE INDEX IF NOT EXISTS idx_overnight_blocks_child_week_active
  ON public.overnight_blocks (child_id, week_start)
  WHERE status = 'active';

-- ============================================================
-- 3. Reservation Deduplication Safety
-- ============================================================
-- The existing partial unique index on (child_id, date) already prevents
-- double-booking. This adds a comment for clarity.
-- Note: partial index already exists: WHERE status NOT IN ('canceled_low_enrollment')

-- ============================================================
-- 4. Archive Semantics — Soft-Delete Policy Enforcement
-- ============================================================
-- Add archived_at columns to entities that should never be hard-deleted.
-- These columns mark records as inactive without removing them.

-- 4a. Children: already have `active` boolean. Add archived_at for timestamp tracking.
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4b. Authorized pickups: already have `is_active` boolean. Add archived_at.
ALTER TABLE public.child_authorized_pickups
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4c. Emergency contacts: add archived_at for soft-removal tracking.
ALTER TABLE public.child_emergency_contacts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4d. Center staff memberships: already have `active` boolean. Add archived_at.
ALTER TABLE public.center_staff_memberships
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4e. Overnight blocks: already have status='cancelled'. Add archived_at for offboarding.
ALTER TABLE public.overnight_blocks
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ============================================================
-- 5. Incident Report — Status Transition Trigger
-- ============================================================
-- Enforce valid incident status transitions:
--   open -> investigating | resolved | closed
--   investigating -> resolved | closed
--   resolved -> closed
--   closed -> (terminal)

CREATE OR REPLACE FUNCTION public.enforce_incident_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE OLD.status
    WHEN 'open' THEN
      IF NEW.status NOT IN ('investigating', 'resolved', 'closed') THEN
        RAISE EXCEPTION 'Invalid incident transition: % -> %', OLD.status, NEW.status;
      END IF;
    WHEN 'investigating' THEN
      IF NEW.status NOT IN ('resolved', 'closed') THEN
        RAISE EXCEPTION 'Invalid incident transition: % -> %', OLD.status, NEW.status;
      END IF;
    WHEN 'resolved' THEN
      IF NEW.status NOT IN ('closed') THEN
        RAISE EXCEPTION 'Invalid incident transition: % -> %', OLD.status, NEW.status;
      END IF;
    WHEN 'closed' THEN
      RAISE EXCEPTION 'Invalid incident transition: % -> % (closed is terminal)', OLD.status, NEW.status;
    ELSE
      RAISE EXCEPTION 'Unknown incident status: %', OLD.status;
  END CASE;

  -- Auto-set timestamps on status changes
  IF NEW.status = 'resolved' AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at = now();
  END IF;
  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_incident_transition ON public.incident_reports;
CREATE TRIGGER enforce_incident_transition
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_incident_transition();

-- ============================================================
-- 6. Prevent Hard Deletes on Safety-Critical Tables
-- ============================================================
-- Block DELETE operations on tables that should only be soft-deleted.

CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletes are not allowed on %. Use soft-delete (set active=false or archived_at) instead.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

-- Block hard deletes on children (use active=false instead)
DROP TRIGGER IF EXISTS prevent_children_hard_delete ON public.children;
CREATE TRIGGER prevent_children_hard_delete
  BEFORE DELETE ON public.children
  FOR EACH ROW
  WHEN (current_setting('app.allow_cascade_delete', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.prevent_hard_delete();

-- Block hard deletes on incident_reports (compliance record)
DROP TRIGGER IF EXISTS prevent_incident_hard_delete ON public.incident_reports;
CREATE TRIGGER prevent_incident_hard_delete
  BEFORE DELETE ON public.incident_reports
  FOR EACH ROW
  WHEN (current_setting('app.allow_cascade_delete', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.prevent_hard_delete();

-- Block hard deletes on pickup_verifications (legal record)
DROP TRIGGER IF EXISTS prevent_pickup_verification_hard_delete ON public.pickup_verifications;
CREATE TRIGGER prevent_pickup_verification_hard_delete
  BEFORE DELETE ON public.pickup_verifications
  FOR EACH ROW
  WHEN (current_setting('app.allow_cascade_delete', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.prevent_hard_delete();

-- ============================================================
-- 7. Cleanup — Auto-expire idempotency keys
-- ============================================================
-- This function can be called periodically (e.g., pg_cron) to clean expired keys.

CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.idempotency_keys WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
