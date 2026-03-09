-- ============================================================
-- Drop is_admin column from parents table
-- ============================================================
-- The is_admin boolean was a redundant admin flag alongside parents.role.
-- All code now uses role = 'admin' as the single source of truth.
--
-- Safety: First ensure any rows with is_admin=true also have role='admin',
-- then drop the column.
-- ============================================================

-- Step 1: Backfill — ensure any parent with is_admin=true has role='admin'
-- This prevents data loss for accounts that were admin via is_admin but not role.
UPDATE public.parents
SET role = 'admin'
WHERE is_admin = true AND role != 'admin';

-- Step 2: Drop the column
ALTER TABLE public.parents DROP COLUMN IF EXISTS is_admin;
