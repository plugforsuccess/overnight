-- ============================================================
-- Migration: Fix parent UID mismatch
--
-- Problem: parents.id is a random UUID (gen_random_uuid()) that does NOT
-- match auth.users.id. A separate auth_user_id column was added to link
-- them, creating a dual-identity architecture that causes onboarding
-- failures, RLS complexity, and identity mismatches.
--
-- Fix: Make parents.id = auth.users.id (single canonical identity).
--
-- Steps:
--   1. Add ON UPDATE CASCADE to all FKs referencing parents.id
--   2. Repair parents.id to match auth_user_id (cascades to child tables)
--   3. Try email-match for any orphaned rows missing auth_user_id
--   4. Remove gen_random_uuid() default from parents.id
--   5. Add FK: parents.id REFERENCES auth.users(id) ON DELETE CASCADE
--   6. Drop the now-redundant auth_user_id column
--   7. Replace all RLS policies to use id = auth.uid() directly
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Add ON UPDATE CASCADE to all FKs referencing parents(id)
--    so that updating parents.id auto-propagates to child tables
-- ============================================================

-- children.parent_id
ALTER TABLE public.children
  DROP CONSTRAINT IF EXISTS children_parent_id_fkey;
ALTER TABLE public.children
  ADD CONSTRAINT children_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.parents(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- overnight_blocks.parent_id
ALTER TABLE public.overnight_blocks
  DROP CONSTRAINT IF EXISTS overnight_blocks_parent_id_fkey;
ALTER TABLE public.overnight_blocks
  ADD CONSTRAINT overnight_blocks_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.parents(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- waitlist.parent_id
ALTER TABLE public.waitlist
  DROP CONSTRAINT IF EXISTS waitlist_parent_id_fkey;
ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.parents(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- credits.parent_id
ALTER TABLE public.credits
  DROP CONSTRAINT IF EXISTS credits_parent_id_fkey;
ALTER TABLE public.credits
  ADD CONSTRAINT credits_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.parents(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- audit_log.actor_id
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.parents(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 2. Repair: set parents.id = auth_user_id where linked
--    ON UPDATE CASCADE propagates to children, blocks, etc.
-- ============================================================

-- Log what we're about to repair
DO $$
DECLARE
  total_parents  int;
  linked_parents int;
  unlinked_parents int;
BEGIN
  SELECT count(*) INTO total_parents FROM public.parents;
  SELECT count(*) INTO linked_parents FROM public.parents WHERE auth_user_id IS NOT NULL;
  unlinked_parents := total_parents - linked_parents;

  RAISE NOTICE 'Parent UID repair: % total, % linked (auth_user_id set), % unlinked',
    total_parents, linked_parents, unlinked_parents;
END $$;

-- Update parents.id to match auth_user_id (cascades to all FK columns)
UPDATE public.parents
SET id = auth_user_id
WHERE auth_user_id IS NOT NULL
  AND id <> auth_user_id;

-- ============================================================
-- 3. Try to match orphaned rows (no auth_user_id) by email
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  auth_id uuid;
  matched int := 0;
  orphaned int := 0;
BEGIN
  FOR rec IN
    SELECT p.id, p.email
    FROM public.parents p
    WHERE p.auth_user_id IS NULL
  LOOP
    -- Look up auth.users by email
    SELECT au.id INTO auth_id
    FROM auth.users au
    WHERE au.email = rec.email
    LIMIT 1;

    IF auth_id IS NOT NULL THEN
      -- Check no other parent already claims this auth id
      IF NOT EXISTS (SELECT 1 FROM public.parents WHERE id = auth_id AND id <> rec.id) THEN
        UPDATE public.parents
        SET id = auth_id, auth_user_id = auth_id
        WHERE id = rec.id;
        matched := matched + 1;
      ELSE
        RAISE WARNING 'Orphaned parent id=% email=% — auth user exists but another parent row already owns it',
          rec.id, rec.email;
        orphaned := orphaned + 1;
      END IF;
    ELSE
      RAISE WARNING 'Orphaned parent id=% email=% — no matching auth.users row found',
        rec.id, rec.email;
      orphaned := orphaned + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Email-match repair: % matched, % orphaned (need manual review)', matched, orphaned;
END $$;

-- ============================================================
-- 4. Remove gen_random_uuid() default from parents.id
--    The app must now always supply the auth user ID explicitly.
-- ============================================================

ALTER TABLE public.parents ALTER COLUMN id DROP DEFAULT;

-- ============================================================
-- 5. Add FK: parents.id REFERENCES auth.users(id) ON DELETE CASCADE
-- ============================================================

ALTER TABLE public.parents
  ADD CONSTRAINT parents_id_fk_auth_users
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- 6. Drop the now-redundant auth_user_id column
-- ============================================================

ALTER TABLE public.parents DROP COLUMN IF EXISTS auth_user_id;

-- ============================================================
-- 7. Replace RLS policies to use id = auth.uid() directly
--    (no more joins through auth_user_id)
-- ============================================================

-- ── parents table ──────────────────────────────────────────
DROP POLICY IF EXISTS parents_select_own ON public.parents;
DROP POLICY IF EXISTS parents_update_own ON public.parents;
DROP POLICY IF EXISTS parents_insert_own ON public.parents;

CREATE POLICY parents_select_own ON public.parents
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY parents_insert_own ON public.parents
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY parents_update_own ON public.parents
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── children table ─────────────────────────────────────────
DROP POLICY IF EXISTS children_select_own ON public.children;
DROP POLICY IF EXISTS children_insert_own ON public.children;
DROP POLICY IF EXISTS children_update_own ON public.children;
DROP POLICY IF EXISTS children_delete_own ON public.children;

CREATE POLICY children_select_own ON public.children
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY children_insert_own ON public.children
  FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY children_update_own ON public.children
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY children_delete_own ON public.children
  FOR DELETE TO authenticated
  USING (parent_id = auth.uid());

-- ── overnight_blocks table ─────────────────────────────────
DROP POLICY IF EXISTS overnight_blocks_select_own ON public.overnight_blocks;
DROP POLICY IF EXISTS overnight_blocks_update_own ON public.overnight_blocks;

CREATE POLICY overnight_blocks_select_own ON public.overnight_blocks
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY overnight_blocks_update_own ON public.overnight_blocks
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- ── reservations table (ownership via overnight_blocks) ────
DROP POLICY IF EXISTS reservations_select_own ON public.reservations;
DROP POLICY IF EXISTS reservations_update_own ON public.reservations;

CREATE POLICY reservations_select_own ON public.reservations
  FOR SELECT TO authenticated
  USING (
    overnight_block_id IN (
      SELECT ob.id FROM public.overnight_blocks ob
      WHERE ob.parent_id = auth.uid()
    )
  );

CREATE POLICY reservations_update_own ON public.reservations
  FOR UPDATE TO authenticated
  USING (
    overnight_block_id IN (
      SELECT ob.id FROM public.overnight_blocks ob
      WHERE ob.parent_id = auth.uid()
    )
  );

-- ── waitlist table ─────────────────────────────────────────
DROP POLICY IF EXISTS waitlist_select_own ON public.waitlist;

CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

-- ── credits table ──────────────────────────────────────────
DROP POLICY IF EXISTS credits_select_own ON public.credits;

CREATE POLICY credits_select_own ON public.credits
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

-- ── Update children_hardening RLS predicates ───────────────
-- These were created dynamically in migration 5; replace with direct checks.

-- child_allergies
DROP POLICY IF EXISTS "parents_select_child_allergies" ON public.child_allergies;
DROP POLICY IF EXISTS "parents_insert_child_allergies" ON public.child_allergies;
DROP POLICY IF EXISTS "parents_update_child_allergies" ON public.child_allergies;
DROP POLICY IF EXISTS "parents_delete_child_allergies" ON public.child_allergies;
DROP POLICY IF EXISTS "admins_manage_child_allergies" ON public.child_allergies;

CREATE POLICY parents_select_child_allergies ON public.child_allergies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_insert_child_allergies ON public.child_allergies
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_update_child_allergies ON public.child_allergies
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_delete_child_allergies ON public.child_allergies
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY admins_manage_child_allergies ON public.child_allergies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents WHERE id = auth.uid() AND role = 'admin'));

-- child_allergy_action_plans
DROP POLICY IF EXISTS "parents_select_action_plans" ON public.child_allergy_action_plans;
DROP POLICY IF EXISTS "parents_insert_action_plans" ON public.child_allergy_action_plans;
DROP POLICY IF EXISTS "parents_update_action_plans" ON public.child_allergy_action_plans;
DROP POLICY IF EXISTS "parents_delete_action_plans" ON public.child_allergy_action_plans;
DROP POLICY IF EXISTS "admins_manage_action_plans" ON public.child_allergy_action_plans;

CREATE POLICY parents_select_action_plans ON public.child_allergy_action_plans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_insert_action_plans ON public.child_allergy_action_plans
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_update_action_plans ON public.child_allergy_action_plans
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_id AND c.parent_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_delete_action_plans ON public.child_allergy_action_plans
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY admins_manage_action_plans ON public.child_allergy_action_plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents WHERE id = auth.uid() AND role = 'admin'));

-- child_emergency_contacts
DROP POLICY IF EXISTS "parents_select_emergency_contacts" ON public.child_emergency_contacts;
DROP POLICY IF EXISTS "parents_insert_emergency_contacts" ON public.child_emergency_contacts;
DROP POLICY IF EXISTS "parents_update_emergency_contacts" ON public.child_emergency_contacts;
DROP POLICY IF EXISTS "parents_delete_emergency_contacts" ON public.child_emergency_contacts;
DROP POLICY IF EXISTS "admins_manage_emergency_contacts" ON public.child_emergency_contacts;

CREATE POLICY parents_select_emergency_contacts ON public.child_emergency_contacts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_insert_emergency_contacts ON public.child_emergency_contacts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_update_emergency_contacts ON public.child_emergency_contacts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_delete_emergency_contacts ON public.child_emergency_contacts
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY admins_manage_emergency_contacts ON public.child_emergency_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents WHERE id = auth.uid() AND role = 'admin'));

-- child_authorized_pickups
DROP POLICY IF EXISTS "parents_select_authorized_pickups" ON public.child_authorized_pickups;
DROP POLICY IF EXISTS "parents_insert_authorized_pickups" ON public.child_authorized_pickups;
DROP POLICY IF EXISTS "parents_update_authorized_pickups" ON public.child_authorized_pickups;
DROP POLICY IF EXISTS "parents_delete_authorized_pickups" ON public.child_authorized_pickups;
DROP POLICY IF EXISTS "admins_manage_authorized_pickups" ON public.child_authorized_pickups;

CREATE POLICY parents_select_authorized_pickups ON public.child_authorized_pickups
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_insert_authorized_pickups ON public.child_authorized_pickups
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_update_authorized_pickups ON public.child_authorized_pickups
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY parents_delete_authorized_pickups ON public.child_authorized_pickups
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY admins_manage_authorized_pickups ON public.child_authorized_pickups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parents WHERE id = auth.uid() AND role = 'admin'));

COMMIT;
