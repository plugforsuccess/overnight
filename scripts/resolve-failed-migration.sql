-- ============================================================
-- Resolve Failed Migration: 20260307000002_enterprise_hardening
-- ============================================================
--
-- Run this script against your Supabase database to recover from
-- the failed migration. It does two things:
--
--   1. Applies the missing pickup_events table that caused the failure
--   2. Marks the migration as successfully applied in Prisma's history
--
-- After running this script, `prisma migrate deploy` will work normally
-- for all subsequent migrations.
--
-- Usage:
--   psql $DATABASE_URL < scripts/resolve-failed-migration.sql
--   — or —
--   Paste into Supabase Dashboard → SQL Editor and run
-- ============================================================

BEGIN;

-- ── Step 1: Ensure uuid-ossp extension exists ───────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Step 2: Create pickup_events table (the missing table) ──
CREATE TABLE IF NOT EXISTS public.pickup_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  pickup_person_id uuid REFERENCES public.child_authorized_pickups(id) ON DELETE SET NULL,
  verified_by_staff_id uuid REFERENCES public.parents(id),
  verification_method text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pickup_events_child
  ON public.pickup_events (child_id, created_at);

-- ── Step 3: Apply RLS on pickup_events ──────────────────────
ALTER TABLE public.pickup_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parents_select_pickup_events ON public.pickup_events;
CREATE POLICY parents_select_pickup_events ON public.pickup_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_pickup_events ON public.pickup_events;
CREATE POLICY admins_manage_pickup_events ON public.pickup_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── Step 4: Mark the failed migration as successfully applied ──
-- This updates Prisma's migration history so it no longer blocks.
UPDATE public._prisma_migrations
  SET finished_at = now(),
      rolled_back_at = NULL,
      logs = 'Resolved manually: pickup_events table was missing from baseline. Fixed by creating table before RLS statements.'
  WHERE migration_name = '20260307000002_enterprise_hardening'
    AND finished_at IS NULL;

-- If the row was marked as rolled_back instead of failed:
UPDATE public._prisma_migrations
  SET rolled_back_at = NULL,
      finished_at = now(),
      logs = 'Resolved manually: pickup_events table was missing from baseline. Fixed by creating table before RLS statements.'
  WHERE migration_name = '20260307000002_enterprise_hardening'
    AND rolled_back_at IS NOT NULL;

COMMIT;

-- ── Verify ──────────────────────────────────────────────────
-- After running, verify the fix:
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
  FROM public._prisma_migrations
  WHERE migration_name = '20260307000002_enterprise_hardening';
