-- ============================================================
-- Supabase Security Artifacts (NOT managed by Prisma)
-- ============================================================
--
-- This file contains all Postgres-level security, constraints,
-- triggers, functions, and enums that Prisma cannot express.
--
-- Apply this file AFTER running Prisma migrations:
--   1. npm run migrate            (Prisma schema)
--   2. psql $DATABASE_URL < supabase/rls-policies.sql
--
-- Or apply via Supabase Dashboard > SQL Editor.
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE allergy_type AS ENUM (
    'PEANUT','TREE_NUT','MILK','EGG','WHEAT','SOY','FISH',
    'SHELLFISH','SESAME','PENICILLIN','INSECT_STING','LATEX',
    'ASTHMA','ENVIRONMENTAL','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE allergy_severity AS ENUM ('UNKNOWN','MILD','MODERATE','SEVERE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE treatment_type AS ENUM (
    'NONE','ANTIHISTAMINE','EPINEPHRINE_AUTOINJECTOR','INHALER','CALL_911','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-set updated_at on row updates (canonical name)
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Legacy alias — kept for backward compatibility
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Enforce max 2 emergency contacts per child
CREATE OR REPLACE FUNCTION public.enforce_max_two_emergency_contacts()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c int;
BEGIN
  SELECT count(*) INTO c
  FROM public.child_emergency_contacts
  WHERE child_id = NEW.child_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF c >= 2 THEN
    RAISE EXCEPTION 'Max 2 emergency contacts allowed per child';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- TRIGGERS
-- ============================================================

-- update_timestamp triggers (idempotent: DROP IF EXISTS then CREATE)
-- Applied to ALL tables with updated_at columns.

DROP TRIGGER IF EXISTS parents_update_timestamp ON public.parents;
CREATE TRIGGER parents_update_timestamp
  BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS children_update_timestamp ON public.children;
CREATE TRIGGER children_update_timestamp
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS child_allergies_set_updated_at ON public.child_allergies;
CREATE TRIGGER child_allergies_set_updated_at
  BEFORE UPDATE ON public.child_allergies
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS child_allergy_action_plans_set_updated_at ON public.child_allergy_action_plans;
CREATE TRIGGER child_allergy_action_plans_set_updated_at
  BEFORE UPDATE ON public.child_allergy_action_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS child_emergency_contacts_set_updated_at ON public.child_emergency_contacts;
CREATE TRIGGER child_emergency_contacts_set_updated_at
  BEFORE UPDATE ON public.child_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS child_authorized_pickups_set_updated_at ON public.child_authorized_pickups;
CREATE TRIGGER child_authorized_pickups_set_updated_at
  BEFORE UPDATE ON public.child_authorized_pickups
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS child_medical_profiles_update_timestamp ON public.child_medical_profiles;
CREATE TRIGGER child_medical_profiles_update_timestamp
  BEFORE UPDATE ON public.child_medical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS child_attendance_sessions_update_timestamp ON public.child_attendance_sessions;
CREATE TRIGGER child_attendance_sessions_update_timestamp
  BEFORE UPDATE ON public.child_attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trg_max_two_emergency_contacts ON public.child_emergency_contacts;
CREATE TRIGGER trg_max_two_emergency_contacts
  BEFORE INSERT OR UPDATE ON public.child_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_two_emergency_contacts();


-- ============================================================
-- CHECK CONSTRAINTS (idempotent: drop + add)
-- ============================================================

-- parents
ALTER TABLE public.parents DROP CONSTRAINT IF EXISTS chk_parents_role;
ALTER TABLE public.parents ADD CONSTRAINT chk_parents_role
  CHECK (role IN ('parent', 'admin'));

-- plans
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS chk_plans_nights;
ALTER TABLE public.plans ADD CONSTRAINT chk_plans_nights
  CHECK (nights_per_week BETWEEN 1 AND 7);

-- overnight_blocks
ALTER TABLE public.overnight_blocks DROP CONSTRAINT IF EXISTS chk_blocks_status;
ALTER TABLE public.overnight_blocks ADD CONSTRAINT chk_blocks_status
  CHECK (status IN ('active', 'cancelled', 'canceled_low_enrollment'));

ALTER TABLE public.overnight_blocks DROP CONSTRAINT IF EXISTS chk_blocks_payment_status;
ALTER TABLE public.overnight_blocks ADD CONSTRAINT chk_blocks_payment_status
  CHECK (payment_status IN ('pending', 'confirmed', 'paid', 'failed', 'locked'));

-- reservations
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS chk_reservations_status;
ALTER TABLE public.reservations ADD CONSTRAINT chk_reservations_status
  CHECK (status IN ('pending_payment', 'confirmed', 'locked', 'canceled', 'cancelled', 'canceled_low_enrollment'));

-- nightly_capacity
ALTER TABLE public.nightly_capacity DROP CONSTRAINT IF EXISTS chk_nightly_capacity_status;
ALTER TABLE public.nightly_capacity ADD CONSTRAINT chk_nightly_capacity_status
  CHECK (status IN ('open', 'full', 'canceled_low_enrollment', 'canceled_admin'));

-- waitlist
ALTER TABLE public.waitlist DROP CONSTRAINT IF EXISTS chk_waitlist_status;
ALTER TABLE public.waitlist ADD CONSTRAINT chk_waitlist_status
  CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'removed'));

-- credits
ALTER TABLE public.credits DROP CONSTRAINT IF EXISTS chk_credits_reason;
ALTER TABLE public.credits ADD CONSTRAINT chk_credits_reason
  CHECK (reason IN ('canceled_low_enrollment', 'admin_manual', 'refund'));

-- subscriptions
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS chk_subscriptions_status;
ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_status
  CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete'));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS chk_subscriptions_plan_tier;
ALTER TABLE public.subscriptions ADD CONSTRAINT chk_subscriptions_plan_tier
  CHECK (plan_tier IN ('plan_3n', 'plan_4n', 'plan_5n'));

-- pending_plan_changes
ALTER TABLE public.pending_plan_changes DROP CONSTRAINT IF EXISTS chk_pending_plan_tier;
ALTER TABLE public.pending_plan_changes ADD CONSTRAINT chk_pending_plan_tier
  CHECK (new_plan_tier IN ('plan_3n', 'plan_4n', 'plan_5n'));


-- ============================================================
-- PARTIAL UNIQUE INDEXES (cannot be expressed in Prisma)
-- ============================================================

-- Only non-canceled reservations enforce child+date uniqueness
DROP INDEX IF EXISTS uniq_reservations_child_date_confirmed;
CREATE UNIQUE INDEX uniq_reservations_child_date_confirmed
  ON public.reservations (child_id, date)
  WHERE status NOT IN ('canceled_low_enrollment', 'canceled', 'cancelled');

-- One active subscription per parent
DROP INDEX IF EXISTS uniq_subscriptions_parent_active;
CREATE UNIQUE INDEX uniq_subscriptions_parent_active
  ON public.subscriptions (parent_id)
  WHERE status IN ('active', 'past_due', 'incomplete');


-- ============================================================
-- AUTH INTEGRATION
-- ============================================================

-- parents.id = auth.users.id — the canonical identity link.
-- This FK ensures that when a Supabase Auth user is deleted,
-- their parent row (and all cascading children) are also deleted.
-- NOTE: Only run this if the FK does not already exist.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parents_auth_user_fk'
  ) THEN
    ALTER TABLE public.parents
      ADD CONSTRAINT parents_auth_user_fk
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ============================================================
-- ROW LEVEL SECURITY — ENABLE
-- ============================================================

ALTER TABLE public.parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overnight_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nightly_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_allergy_action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_authorized_pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- ROW LEVEL SECURITY — POLICIES
-- ============================================================
-- Identity model: parents.id = auth.uid() (directly).

-- ── parents ─────────────────────────────────────────────────
DROP POLICY IF EXISTS parents_select_own ON public.parents;
CREATE POLICY parents_select_own ON public.parents
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS parents_insert_own ON public.parents;
CREATE POLICY parents_insert_own ON public.parents
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS parents_update_own ON public.parents;
CREATE POLICY parents_update_own ON public.parents
  FOR UPDATE USING (id = auth.uid());

-- ── children ────────────────────────────────────────────────
DROP POLICY IF EXISTS children_select_own ON public.children;
CREATE POLICY children_select_own ON public.children
  FOR SELECT USING (parent_id = auth.uid());

DROP POLICY IF EXISTS children_insert_own ON public.children;
CREATE POLICY children_insert_own ON public.children
  FOR INSERT WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS children_update_own ON public.children;
CREATE POLICY children_update_own ON public.children
  FOR UPDATE USING (parent_id = auth.uid());

DROP POLICY IF EXISTS children_delete_own ON public.children;
CREATE POLICY children_delete_own ON public.children
  FOR DELETE USING (parent_id = auth.uid());

-- ── plans ───────────────────────────────────────────────────
DROP POLICY IF EXISTS plans_select_all ON public.plans;
CREATE POLICY plans_select_all ON public.plans
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── overnight_blocks ────────────────────────────────────────
DROP POLICY IF EXISTS overnight_blocks_select_own ON public.overnight_blocks;
CREATE POLICY overnight_blocks_select_own ON public.overnight_blocks
  FOR SELECT USING (parent_id = auth.uid());

DROP POLICY IF EXISTS overnight_blocks_update_own ON public.overnight_blocks;
CREATE POLICY overnight_blocks_update_own ON public.overnight_blocks
  FOR UPDATE USING (parent_id = auth.uid());

-- ── reservations ────────────────────────────────────────────
DROP POLICY IF EXISTS reservations_select_own ON public.reservations;
CREATE POLICY reservations_select_own ON public.reservations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.overnight_blocks ob
      WHERE ob.id = overnight_block_id AND ob.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS reservations_update_own ON public.reservations;
CREATE POLICY reservations_update_own ON public.reservations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.overnight_blocks ob
      WHERE ob.id = overnight_block_id AND ob.parent_id = auth.uid()
    )
  );

-- ── waitlist ────────────────────────────────────────────────
DROP POLICY IF EXISTS waitlist_select_own ON public.waitlist;
CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT USING (parent_id = auth.uid());

-- ── credits ─────────────────────────────────────────────────
DROP POLICY IF EXISTS credits_select_own ON public.credits;
CREATE POLICY credits_select_own ON public.credits
  FOR SELECT USING (parent_id = auth.uid());

-- ── nightly_capacity ────────────────────────────────────────
DROP POLICY IF EXISTS nightly_capacity_select_all ON public.nightly_capacity;
CREATE POLICY nightly_capacity_select_all ON public.nightly_capacity
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── admin_settings ──────────────────────────────────────────
DROP POLICY IF EXISTS admin_settings_select_all ON public.admin_settings;
CREATE POLICY admin_settings_select_all ON public.admin_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── payments ────────────────────────────────────────────────
DROP POLICY IF EXISTS payments_select_own ON public.payments;
CREATE POLICY payments_select_own ON public.payments
  FOR SELECT USING (parent_id = auth.uid());

-- ── child_allergies ─────────────────────────────────────────
DROP POLICY IF EXISTS parents_select_child_allergies ON public.child_allergies;
CREATE POLICY parents_select_child_allergies ON public.child_allergies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_child_allergies ON public.child_allergies;
CREATE POLICY parents_insert_child_allergies ON public.child_allergies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_child_allergies ON public.child_allergies;
CREATE POLICY parents_update_child_allergies ON public.child_allergies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_delete_child_allergies ON public.child_allergies;
CREATE POLICY parents_delete_child_allergies ON public.child_allergies
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_child_allergies ON public.child_allergies;
CREATE POLICY admins_manage_child_allergies ON public.child_allergies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_allergy_action_plans ──────────────────────────────
DROP POLICY IF EXISTS parents_select_action_plans ON public.child_allergy_action_plans;
CREATE POLICY parents_select_action_plans ON public.child_allergy_action_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.child_allergies ca
      JOIN public.children c ON c.id = ca.child_id
      WHERE ca.id = child_allergy_id AND c.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS parents_insert_action_plans ON public.child_allergy_action_plans;
CREATE POLICY parents_insert_action_plans ON public.child_allergy_action_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.child_allergies ca
      JOIN public.children c ON c.id = ca.child_id
      WHERE ca.id = child_allergy_id AND c.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS parents_update_action_plans ON public.child_allergy_action_plans;
CREATE POLICY parents_update_action_plans ON public.child_allergy_action_plans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.child_allergies ca
      JOIN public.children c ON c.id = ca.child_id
      WHERE ca.id = child_allergy_id AND c.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS parents_delete_action_plans ON public.child_allergy_action_plans;
CREATE POLICY parents_delete_action_plans ON public.child_allergy_action_plans
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.child_allergies ca
      JOIN public.children c ON c.id = ca.child_id
      WHERE ca.id = child_allergy_id AND c.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS admins_manage_action_plans ON public.child_allergy_action_plans;
CREATE POLICY admins_manage_action_plans ON public.child_allergy_action_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_emergency_contacts ────────────────────────────────
DROP POLICY IF EXISTS parents_select_emergency_contacts ON public.child_emergency_contacts;
CREATE POLICY parents_select_emergency_contacts ON public.child_emergency_contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_emergency_contacts ON public.child_emergency_contacts;
CREATE POLICY parents_insert_emergency_contacts ON public.child_emergency_contacts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_emergency_contacts ON public.child_emergency_contacts;
CREATE POLICY parents_update_emergency_contacts ON public.child_emergency_contacts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_delete_emergency_contacts ON public.child_emergency_contacts;
CREATE POLICY parents_delete_emergency_contacts ON public.child_emergency_contacts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_emergency_contacts ON public.child_emergency_contacts;
CREATE POLICY admins_manage_emergency_contacts ON public.child_emergency_contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_authorized_pickups ────────────────────────────────
DROP POLICY IF EXISTS parents_select_authorized_pickups ON public.child_authorized_pickups;
CREATE POLICY parents_select_authorized_pickups ON public.child_authorized_pickups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_authorized_pickups ON public.child_authorized_pickups;
CREATE POLICY parents_insert_authorized_pickups ON public.child_authorized_pickups
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_authorized_pickups ON public.child_authorized_pickups;
CREATE POLICY parents_update_authorized_pickups ON public.child_authorized_pickups
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_delete_authorized_pickups ON public.child_authorized_pickups;
CREATE POLICY parents_delete_authorized_pickups ON public.child_authorized_pickups
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_authorized_pickups ON public.child_authorized_pickups;
CREATE POLICY admins_manage_authorized_pickups ON public.child_authorized_pickups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_medical_profiles ───────────────────────────────────
DROP POLICY IF EXISTS parents_select_medical_profiles ON public.child_medical_profiles;
CREATE POLICY parents_select_medical_profiles ON public.child_medical_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_medical_profiles ON public.child_medical_profiles;
CREATE POLICY parents_insert_medical_profiles ON public.child_medical_profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_medical_profiles ON public.child_medical_profiles;
CREATE POLICY parents_update_medical_profiles ON public.child_medical_profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_delete_medical_profiles ON public.child_medical_profiles;
CREATE POLICY parents_delete_medical_profiles ON public.child_medical_profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_medical_profiles ON public.child_medical_profiles;
CREATE POLICY admins_manage_medical_profiles ON public.child_medical_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_documents ────────────────────────────────────────────
ALTER TABLE public.child_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parents_select_child_documents ON public.child_documents;
CREATE POLICY parents_select_child_documents ON public.child_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_child_documents ON public.child_documents;
CREATE POLICY parents_insert_child_documents ON public.child_documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_child_documents ON public.child_documents;
CREATE POLICY parents_update_child_documents ON public.child_documents
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_delete_child_documents ON public.child_documents;
CREATE POLICY parents_delete_child_documents ON public.child_documents
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_child_documents ON public.child_documents;
CREATE POLICY admins_manage_child_documents ON public.child_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_immunization_records ──────────────────────────────────
ALTER TABLE public.child_immunization_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parents_select_immunization ON public.child_immunization_records;
CREATE POLICY parents_select_immunization ON public.child_immunization_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_immunization ON public.child_immunization_records;
CREATE POLICY parents_insert_immunization ON public.child_immunization_records
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_immunization ON public.child_immunization_records;
CREATE POLICY parents_update_immunization ON public.child_immunization_records
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_immunization ON public.child_immunization_records;
CREATE POLICY admins_manage_immunization ON public.child_immunization_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── medication_authorizations ───────────────────────────────────
ALTER TABLE public.medication_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parents_select_med_auth ON public.medication_authorizations;
CREATE POLICY parents_select_med_auth ON public.medication_authorizations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_med_auth ON public.medication_authorizations;
CREATE POLICY parents_insert_med_auth ON public.medication_authorizations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_update_med_auth ON public.medication_authorizations;
CREATE POLICY parents_update_med_auth ON public.medication_authorizations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_delete_med_auth ON public.medication_authorizations;
CREATE POLICY parents_delete_med_auth ON public.medication_authorizations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_med_auth ON public.medication_authorizations;
CREATE POLICY admins_manage_med_auth ON public.medication_authorizations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── medication_administration_logs ──────────────────────────────
ALTER TABLE public.medication_administration_logs ENABLE ROW LEVEL SECURITY;

-- Parents can view administration logs for their children
DROP POLICY IF EXISTS parents_select_med_admin_logs ON public.medication_administration_logs;
CREATE POLICY parents_select_med_admin_logs ON public.medication_administration_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.medication_authorizations ma
      JOIN public.children c ON c.id = ma.child_id
      WHERE ma.id = medication_authorization_id AND c.parent_id = auth.uid()
    )
  );

-- Only admins/staff can insert administration logs
DROP POLICY IF EXISTS admins_manage_med_admin_logs ON public.medication_administration_logs;
CREATE POLICY admins_manage_med_admin_logs ON public.medication_administration_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_events (append-only ledger) ────────────────────────
DROP POLICY IF EXISTS parents_select_child_events ON public.child_events;
CREATE POLICY parents_select_child_events ON public.child_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS parents_insert_child_events ON public.child_events;
CREATE POLICY parents_insert_child_events ON public.child_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- NO update/delete for parents — events are append-only

DROP POLICY IF EXISTS admins_manage_child_events ON public.child_events;
CREATE POLICY admins_manage_child_events ON public.child_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_attendance_sessions ────────────────────────────────
DROP POLICY IF EXISTS parents_select_attendance ON public.child_attendance_sessions;
CREATE POLICY parents_select_attendance ON public.child_attendance_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- Only admins/staff can manage attendance sessions
DROP POLICY IF EXISTS admins_manage_attendance ON public.child_attendance_sessions;
CREATE POLICY admins_manage_attendance ON public.child_attendance_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── audit_log ────────────────────────────────────────────────
DROP POLICY IF EXISTS parents_select_own_audit ON public.audit_log;
CREATE POLICY parents_select_own_audit ON public.audit_log
  FOR SELECT USING (actor_id = auth.uid());

DROP POLICY IF EXISTS admins_manage_audit ON public.audit_log;
CREATE POLICY admins_manage_audit ON public.audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── pickup_events ────────────────────────────────────────────
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

-- ── onboarding_status check ──────────────────────────────────
ALTER TABLE public.parents DROP CONSTRAINT IF EXISTS chk_parents_onboarding_status;
ALTER TABLE public.parents ADD CONSTRAINT chk_parents_onboarding_status
  CHECK (onboarding_status IN (
    'started',
    'parent_profile_complete',
    'child_created',
    'medical_ack_complete',
    'emergency_contact_added',
    'complete'
  ));

-- ── attendance session status check ──────────────────────────
ALTER TABLE public.child_attendance_sessions DROP CONSTRAINT IF EXISTS chk_attendance_status;
ALTER TABLE public.child_attendance_sessions ADD CONSTRAINT chk_attendance_status
  CHECK (status IN (
    'scheduled',
    'checked_in',
    'in_care',
    'ready_for_pickup',
    'checked_out',
    'cancelled'
  ));

-- ── emergency contact deduplication ──────────────────────────
-- Prevent same phone number being added twice for same child
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'child_emergency_contacts_child_id_phone_unique'
  ) THEN
    CREATE UNIQUE INDEX child_emergency_contacts_child_id_phone_unique
      ON public.child_emergency_contacts (child_id, phone);
  END IF;
END $$;

-- ── reservation_events (append-only) ─────────────────────────
DROP POLICY IF EXISTS parents_select_reservation_events ON public.reservation_events;
CREATE POLICY parents_select_reservation_events ON public.reservation_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      JOIN public.overnight_blocks ob ON ob.id = r.overnight_block_id
      WHERE r.id = reservation_id AND ob.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS admins_manage_reservation_events ON public.reservation_events;
CREATE POLICY admins_manage_reservation_events ON public.reservation_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── incident_reports ─────────────────────────────────────────
DROP POLICY IF EXISTS parents_select_incident_reports ON public.incident_reports;
CREATE POLICY parents_select_incident_reports ON public.incident_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS admins_manage_incident_reports ON public.incident_reports;
CREATE POLICY admins_manage_incident_reports ON public.incident_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── center_staff_memberships ─────────────────────────────────
DROP POLICY IF EXISTS users_select_own_memberships ON public.center_staff_memberships;
CREATE POLICY users_select_own_memberships ON public.center_staff_memberships
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS admins_manage_memberships ON public.center_staff_memberships;
CREATE POLICY admins_manage_memberships ON public.center_staff_memberships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── pickup_verifications ─────────────────────────────────────
DROP POLICY IF EXISTS parents_select_pickup_verifications ON public.pickup_verifications;
CREATE POLICY parents_select_pickup_verifications ON public.pickup_verifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.child_attendance_sessions cas
      JOIN public.children c ON c.id = cas.child_id
      WHERE cas.id = attendance_session_id AND c.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS admins_manage_pickup_verifications ON public.pickup_verifications;
CREATE POLICY admins_manage_pickup_verifications ON public.pickup_verifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── incident report constraints ──────────────────────────────
ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS chk_incident_severity;
ALTER TABLE public.incident_reports ADD CONSTRAINT chk_incident_severity
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS chk_incident_status;
ALTER TABLE public.incident_reports ADD CONSTRAINT chk_incident_status
  CHECK (status IN ('open', 'investigating', 'resolved', 'closed'));

-- ── staff membership role constraint ─────────────────────────
ALTER TABLE public.center_staff_memberships DROP CONSTRAINT IF EXISTS chk_staff_role;
ALTER TABLE public.center_staff_memberships ADD CONSTRAINT chk_staff_role
  CHECK (role IN ('staff', 'admin', 'center_admin', 'super_admin'));

-- ── attendance state machine trigger ─────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_attendance_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  valid boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE OLD.status
    WHEN 'scheduled' THEN
      valid := NEW.status IN ('checked_in', 'cancelled');
    WHEN 'checked_in' THEN
      valid := NEW.status IN ('in_care', 'cancelled');
    WHEN 'in_care' THEN
      valid := NEW.status IN ('ready_for_pickup', 'cancelled');
    WHEN 'ready_for_pickup' THEN
      valid := NEW.status IN ('checked_out', 'cancelled');
    WHEN 'checked_out' THEN
      valid := false;
    WHEN 'cancelled' THEN
      valid := false;
    ELSE
      valid := false;
  END CASE;

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid attendance transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_attendance_transition ON public.child_attendance_sessions;
CREATE TRIGGER trg_enforce_attendance_transition
  BEFORE UPDATE ON public.child_attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_transition();

-- ============================================================
-- SPRINT HARDENING: Idempotency, Archive, Incident Transitions
-- ============================================================

-- ── idempotency_keys ────────────────────────────────────────
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
-- No user-facing policies — managed by service role only.

-- ── booking deduplication (one active block per child per week) ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_overnight_blocks_child_week_active'
  ) THEN
    CREATE UNIQUE INDEX idx_overnight_blocks_child_week_active
      ON public.overnight_blocks (child_id, week_start)
      WHERE status = 'active';
  END IF;
END $$;

-- ── incident status transition trigger ──────────────────────
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

-- ── hard delete prevention on safety-critical tables ────────
CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletes are not allowed on %. Use soft-delete (set active=false or archived_at) instead.', TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prevent_children_hard_delete ON public.children;
CREATE TRIGGER prevent_children_hard_delete
  BEFORE DELETE ON public.children
  FOR EACH ROW
  WHEN (current_setting('app.allow_cascade_delete', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_incident_hard_delete ON public.incident_reports;
CREATE TRIGGER prevent_incident_hard_delete
  BEFORE DELETE ON public.incident_reports
  FOR EACH ROW
  WHEN (current_setting('app.allow_cascade_delete', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.prevent_hard_delete();

DROP TRIGGER IF EXISTS prevent_pickup_verification_hard_delete ON public.pickup_verifications;
CREATE TRIGGER prevent_pickup_verification_hard_delete
  BEFORE DELETE ON public.pickup_verifications
  FOR EACH ROW
  WHEN (current_setting('app.allow_cascade_delete', true) IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.prevent_hard_delete();

-- ── idempotency key cleanup function ────────────────────────
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

-- ============================================================
-- RESERVATION CALENDAR HARDENING
-- ============================================================

-- ── centers ───────────────────────────────────────────────────
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS centers_select_authenticated ON public.centers;
CREATE POLICY centers_select_authenticated ON public.centers
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS admins_manage_centers ON public.centers;
CREATE POLICY admins_manage_centers ON public.centers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── programs ──────────────────────────────────────────────────
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS programs_select_authenticated ON public.programs;
CREATE POLICY programs_select_authenticated ON public.programs
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS admins_manage_programs ON public.programs;
CREATE POLICY admins_manage_programs ON public.programs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

ALTER TABLE public.programs DROP CONSTRAINT IF EXISTS chk_programs_care_type;
ALTER TABLE public.programs ADD CONSTRAINT chk_programs_care_type
  CHECK (care_type IN ('overnight', 'daycare', 'drop_in'));

-- ── program_capacity ──────────────────────────────────────────
ALTER TABLE public.program_capacity ENABLE ROW LEVEL SECURITY;

-- Parents can read capacity for calendar rendering
DROP POLICY IF EXISTS program_capacity_select_authenticated ON public.program_capacity;
CREATE POLICY program_capacity_select_authenticated ON public.program_capacity
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admins / service role can mutate capacity
DROP POLICY IF EXISTS admins_manage_program_capacity ON public.program_capacity;
CREATE POLICY admins_manage_program_capacity ON public.program_capacity
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

ALTER TABLE public.program_capacity DROP CONSTRAINT IF EXISTS chk_program_capacity_status;
ALTER TABLE public.program_capacity ADD CONSTRAINT chk_program_capacity_status
  CHECK (status IN ('open', 'full', 'closed'));

ALTER TABLE public.program_capacity DROP CONSTRAINT IF EXISTS chk_program_capacity_reserved_nonneg;
ALTER TABLE public.program_capacity ADD CONSTRAINT chk_program_capacity_reserved_nonneg
  CHECK (capacity_reserved >= 0);

ALTER TABLE public.program_capacity DROP CONSTRAINT IF EXISTS chk_program_capacity_waitlisted_nonneg;
ALTER TABLE public.program_capacity ADD CONSTRAINT chk_program_capacity_waitlisted_nonneg
  CHECK (capacity_waitlisted >= 0);

ALTER TABLE public.program_capacity DROP CONSTRAINT IF EXISTS chk_program_capacity_reserved_lte_total;
ALTER TABLE public.program_capacity ADD CONSTRAINT chk_program_capacity_reserved_lte_total
  CHECK (capacity_reserved <= capacity_total);

ALTER TABLE public.program_capacity DROP CONSTRAINT IF EXISTS chk_program_capacity_total_positive;
ALTER TABLE public.program_capacity ADD CONSTRAINT chk_program_capacity_total_positive
  CHECK (capacity_total > 0);

-- ── reservation_nights ────────────────────────────────────────
ALTER TABLE public.reservation_nights ENABLE ROW LEVEL SECURITY;

-- Parents can read their own reservation_nights via child ownership
DROP POLICY IF EXISTS parents_select_reservation_nights ON public.reservation_nights;
CREATE POLICY parents_select_reservation_nights ON public.reservation_nights
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- Only service role / admin can insert/update/delete
DROP POLICY IF EXISTS admins_manage_reservation_nights ON public.reservation_nights;
CREATE POLICY admins_manage_reservation_nights ON public.reservation_nights
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

ALTER TABLE public.reservation_nights DROP CONSTRAINT IF EXISTS chk_reservation_nights_status;
ALTER TABLE public.reservation_nights ADD CONSTRAINT chk_reservation_nights_status
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'waitlisted', 'no_show'));

ALTER TABLE public.reservation_nights DROP CONSTRAINT IF EXISTS chk_reservation_nights_capacity_snapshot;
ALTER TABLE public.reservation_nights ADD CONSTRAINT chk_reservation_nights_capacity_snapshot
  CHECK (capacity_snapshot > 0);

-- Partial unique index: prevent duplicate active bookings for same child on same date
DROP INDEX IF EXISTS uniq_reservation_nights_child_date_active;
CREATE UNIQUE INDEX uniq_reservation_nights_child_date_active
  ON public.reservation_nights (child_id, care_date)
  WHERE status NOT IN ('cancelled');

-- ── update_timestamp triggers for new tables ──────────────────

DROP TRIGGER IF EXISTS centers_update_timestamp ON public.centers;
CREATE TRIGGER centers_update_timestamp
  BEFORE UPDATE ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS programs_update_timestamp ON public.programs;
CREATE TRIGGER programs_update_timestamp
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS program_capacity_update_timestamp ON public.program_capacity;
CREATE TRIGGER program_capacity_update_timestamp
  BEFORE UPDATE ON public.program_capacity
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS reservation_nights_update_timestamp ON public.reservation_nights;
CREATE TRIGGER reservation_nights_update_timestamp
  BEFORE UPDATE ON public.reservation_nights
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ── Atomic booking function ───────────────────────────────────
-- Called by the booking API to lock capacity rows, verify availability,
-- and atomically create reservation_nights + increment counters.
-- Returns JSON with confirmed and waitlisted night IDs.
CREATE OR REPLACE FUNCTION public.atomic_book_nights(
  p_reservation_id UUID,
  p_child_id UUID,
  p_night_dates TEXT[],
  p_default_capacity INT DEFAULT 6
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_date TEXT;
  v_pc RECORD;
  v_confirmed TEXT[] := '{}';
  v_waitlisted TEXT[] := '{}';
  v_cap INT;
  v_reserved INT;
BEGIN
  -- Process each requested date
  FOREACH v_date IN ARRAY p_night_dates LOOP
    -- Lock the program_capacity row (or use fallback)
    SELECT id, capacity_total, capacity_reserved, status
      INTO v_pc
      FROM public.program_capacity
      WHERE care_date = v_date::DATE
      FOR UPDATE;

    IF v_pc IS NOT NULL THEN
      -- Use program_capacity
      v_cap := v_pc.capacity_total;
      v_reserved := v_pc.capacity_reserved;

      IF v_reserved < v_cap AND v_pc.status NOT IN ('full', 'closed') THEN
        -- Available: create confirmed night
        INSERT INTO public.reservation_nights
          (reservation_id, child_id, program_capacity_id, care_date, status, capacity_snapshot)
        VALUES
          (p_reservation_id, p_child_id, v_pc.id, v_date::DATE, 'pending', v_cap);

        UPDATE public.program_capacity
        SET capacity_reserved = capacity_reserved + 1,
            status = CASE WHEN capacity_reserved + 1 >= capacity_total THEN 'full' ELSE 'open' END
        WHERE id = v_pc.id;

        v_confirmed := array_append(v_confirmed, v_date);
      ELSE
        -- Full: create waitlisted night
        INSERT INTO public.reservation_nights
          (reservation_id, child_id, program_capacity_id, care_date, status, capacity_snapshot)
        VALUES
          (p_reservation_id, p_child_id, v_pc.id, v_date::DATE, 'waitlisted', v_cap);

        UPDATE public.program_capacity
        SET capacity_waitlisted = capacity_waitlisted + 1
        WHERE id = v_pc.id;

        v_waitlisted := array_append(v_waitlisted, v_date);
      END IF;
    ELSE
      -- Fallback: count reservations for this date
      SELECT COUNT(*) INTO v_reserved
        FROM public.reservations
        WHERE date = v_date::DATE AND status = 'confirmed';

      v_cap := p_default_capacity;

      IF v_reserved < v_cap THEN
        INSERT INTO public.reservation_nights
          (reservation_id, child_id, care_date, status, capacity_snapshot)
        VALUES
          (p_reservation_id, p_child_id, v_date::DATE, 'pending', v_cap);
        v_confirmed := array_append(v_confirmed, v_date);
      ELSE
        INSERT INTO public.reservation_nights
          (reservation_id, child_id, care_date, status, capacity_snapshot)
        VALUES
          (p_reservation_id, p_child_id, v_date::DATE, 'waitlisted', v_cap);
        v_waitlisted := array_append(v_waitlisted, v_date);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'confirmed', to_jsonb(v_confirmed),
    'waitlisted', to_jsonb(v_waitlisted)
  );
END;
$$;

-- ── Atomic cancellation function ──────────────────────────────
-- Cancels a reservation_night and decrements capacity counters.
CREATE OR REPLACE FUNCTION public.atomic_cancel_night(
  p_reservation_night_id UUID
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_night RECORD;
BEGIN
  -- Lock the reservation_night row
  SELECT id, program_capacity_id, status
    INTO v_night
    FROM public.reservation_nights
    WHERE id = p_reservation_night_id
    FOR UPDATE;

  IF v_night IS NULL THEN
    RAISE EXCEPTION 'Reservation night not found: %', p_reservation_night_id;
  END IF;

  IF v_night.status = 'cancelled' THEN
    RETURN; -- Already cancelled, idempotent
  END IF;

  -- Update the night status
  UPDATE public.reservation_nights
  SET status = 'cancelled'
  WHERE id = p_reservation_night_id;

  -- Decrement counter on program_capacity if linked
  IF v_night.program_capacity_id IS NOT NULL THEN
    IF v_night.status IN ('pending', 'confirmed', 'completed') THEN
      UPDATE public.program_capacity
      SET capacity_reserved = GREATEST(capacity_reserved - 1, 0),
          status = CASE WHEN capacity_reserved - 1 < capacity_total THEN 'open' ELSE status END
      WHERE id = v_night.program_capacity_id;
    ELSIF v_night.status = 'waitlisted' THEN
      UPDATE public.program_capacity
      SET capacity_waitlisted = GREATEST(capacity_waitlisted - 1, 0)
      WHERE id = v_night.program_capacity_id;
    END IF;
  END IF;
END;
$$;

-- ── Capacity reconciliation function ──────────────────────────
-- Compares counters to actual reservation_nights. Run nightly or on demand.
CREATE OR REPLACE FUNCTION public.reconcile_program_capacity()
RETURNS TABLE(
  program_capacity_id UUID,
  care_date DATE,
  counter_reserved INT,
  actual_reserved BIGINT,
  counter_waitlisted INT,
  actual_waitlisted BIGINT,
  drift_reserved BIGINT,
  drift_waitlisted BIGINT
) LANGUAGE sql AS $$
  SELECT
    pc.id AS program_capacity_id,
    pc.care_date,
    pc.capacity_reserved AS counter_reserved,
    COALESCE(r.actual_reserved, 0) AS actual_reserved,
    pc.capacity_waitlisted AS counter_waitlisted,
    COALESCE(w.actual_waitlisted, 0) AS actual_waitlisted,
    pc.capacity_reserved - COALESCE(r.actual_reserved, 0) AS drift_reserved,
    pc.capacity_waitlisted - COALESCE(w.actual_waitlisted, 0) AS drift_waitlisted
  FROM public.program_capacity pc
  LEFT JOIN (
    SELECT program_capacity_id, COUNT(*) AS actual_reserved
    FROM public.reservation_nights
    WHERE status IN ('pending', 'confirmed', 'completed')
    GROUP BY program_capacity_id
  ) r ON r.program_capacity_id = pc.id
  LEFT JOIN (
    SELECT program_capacity_id, COUNT(*) AS actual_waitlisted
    FROM public.reservation_nights
    WHERE status = 'waitlisted'
    GROUP BY program_capacity_id
  ) w ON w.program_capacity_id = pc.id
  WHERE pc.capacity_reserved != COALESCE(r.actual_reserved, 0)
     OR pc.capacity_waitlisted != COALESCE(w.actual_waitlisted, 0);
$$;


-- ============================================================
-- RESERVATION NIGHT STATUS TRANSITIONS
-- ============================================================
-- Enforces a valid state machine on reservation_nights.status:
--   pending → confirmed | cancelled | waitlisted
--   confirmed → completed | cancelled | no_show
--   waitlisted → confirmed | cancelled
--   completed → (terminal)
--   cancelled → (terminal)
--   no_show → (terminal)

CREATE OR REPLACE FUNCTION public.enforce_reservation_night_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  valid boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  CASE OLD.status
    WHEN 'pending' THEN
      valid := NEW.status IN ('confirmed', 'cancelled', 'waitlisted');
    WHEN 'confirmed' THEN
      valid := NEW.status IN ('completed', 'cancelled', 'no_show');
    WHEN 'waitlisted' THEN
      valid := NEW.status IN ('confirmed', 'cancelled');
    WHEN 'completed' THEN
      valid := false;
    WHEN 'cancelled' THEN
      valid := false;
    WHEN 'no_show' THEN
      valid := false;
    ELSE
      valid := false;
  END CASE;

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid reservation_night transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_reservation_night_transition ON public.reservation_nights;
CREATE TRIGGER trg_enforce_reservation_night_transition
  BEFORE UPDATE ON public.reservation_nights
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_night_transition();


-- ============================================================
-- RESERVATION LIFECYCLE EVENT LOGGING
-- ============================================================
-- Automatically emits immutable reservation_events when
-- reservation_nights.status changes. Covers the full lifecycle.

CREATE OR REPLACE FUNCTION public.emit_reservation_night_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'reservation_night_created';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'confirmed' THEN
        IF OLD.status = 'waitlisted' THEN
          v_event_type := 'waitlist_promoted';
        ELSE
          v_event_type := 'reservation_night_confirmed';
        END IF;
      WHEN 'cancelled' THEN
        v_event_type := 'reservation_night_cancelled';
      WHEN 'completed' THEN
        v_event_type := 'reservation_night_completed';
      WHEN 'waitlisted' THEN
        v_event_type := 'reservation_night_waitlisted';
      WHEN 'no_show' THEN
        v_event_type := 'no_show_marked';
      ELSE
        v_event_type := 'reservation_night_status_changed';
    END CASE;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.reservation_events (
    reservation_id,
    event_type,
    event_data,
    created_by
  ) VALUES (
    NEW.reservation_id,
    v_event_type,
    jsonb_build_object(
      'reservation_night_id', NEW.id,
      'care_date', NEW.care_date,
      'child_id', NEW.child_id,
      'old_status', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      'new_status', NEW.status,
      'capacity_snapshot', NEW.capacity_snapshot,
      'program_capacity_id', NEW.program_capacity_id
    ),
    '00000000-0000-0000-0000-000000000000'::UUID -- system actor
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_reservation_night_event ON public.reservation_nights;
CREATE TRIGGER trg_emit_reservation_night_event
  AFTER INSERT OR UPDATE ON public.reservation_nights
  FOR EACH ROW EXECUTE FUNCTION public.emit_reservation_night_event();


-- ============================================================
-- WAITLIST PROMOTION
-- ============================================================
-- Atomically promotes the highest-priority waitlisted reservation_night
-- for a given care_date. Called when a slot opens (cancellation, etc.).
--
-- Priority: FIFO by created_at.
-- Locks program_capacity + the waitlisted night row.
-- Returns the promoted reservation_night ID, or NULL if no one is waiting.

CREATE OR REPLACE FUNCTION public.promote_waitlist(
  p_care_date DATE
)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_pc RECORD;
  v_night RECORD;
BEGIN
  -- Lock the capacity row
  SELECT id, capacity_total, capacity_reserved, capacity_waitlisted, status
    INTO v_pc
    FROM public.program_capacity
    WHERE care_date = p_care_date
    FOR UPDATE;

  IF v_pc IS NULL THEN
    RETURN NULL; -- No capacity row for this date
  END IF;

  -- Check if there's actually a slot
  IF v_pc.capacity_reserved >= v_pc.capacity_total THEN
    RETURN NULL; -- Still full
  END IF;

  -- Find the next waitlisted night (FIFO)
  SELECT id, reservation_id, child_id
    INTO v_night
    FROM public.reservation_nights
    WHERE care_date = p_care_date
      AND status = 'waitlisted'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

  IF v_night IS NULL THEN
    RETURN NULL; -- No one waiting
  END IF;

  -- Promote: waitlisted → confirmed
  UPDATE public.reservation_nights
  SET status = 'confirmed'
  WHERE id = v_night.id;

  -- Update counters
  UPDATE public.program_capacity
  SET capacity_reserved = capacity_reserved + 1,
      capacity_waitlisted = GREATEST(capacity_waitlisted - 1, 0),
      status = CASE WHEN capacity_reserved + 1 >= capacity_total THEN 'full' ELSE 'open' END
  WHERE id = v_pc.id;

  RETURN v_night.id;
END;
$$;


-- ============================================================
-- CAPACITY LAZY-CREATE FUNCTION
-- ============================================================
-- Ensures program_capacity rows exist for a list of dates.
-- Creates missing rows from defaults. Called by booking & capacity APIs.

CREATE OR REPLACE FUNCTION public.ensure_capacity_rows(
  p_dates DATE[],
  p_default_capacity INT DEFAULT 6
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_program_id UUID;
  v_center_id UUID;
  v_date DATE;
BEGIN
  -- Find the default overnight program
  SELECT id, center_id INTO v_program_id, v_center_id
    FROM public.programs
    WHERE care_type = 'overnight' AND is_active = true
    LIMIT 1;

  IF v_program_id IS NULL THEN
    RETURN; -- No program configured yet
  END IF;

  FOREACH v_date IN ARRAY p_dates LOOP
    INSERT INTO public.program_capacity
      (center_id, program_id, care_date, capacity_total, capacity_reserved, capacity_waitlisted, status)
    VALUES
      (v_center_id, v_program_id, v_date, p_default_capacity, 0, 0, 'open')
    ON CONFLICT (program_id, care_date) DO NOTHING;
  END LOOP;
END;
$$;

-- ── incident_case_files / notes / actions ───────────────────
ALTER TABLE public.incident_case_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_case_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incident_case_files_select_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_select_policy ON public.incident_case_files
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
  OR EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = incident_case_files.child_id
      AND c.parent_id = auth.uid()
      AND c.facility_id = incident_case_files.facility_id
  )
);

DROP POLICY IF EXISTS incident_case_files_insert_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_insert_policy ON public.incident_case_files
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS incident_case_files_update_policy ON public.incident_case_files;
CREATE POLICY incident_case_files_update_policy ON public.incident_case_files
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

CREATE OR REPLACE FUNCTION public.parent_acknowledge_incident_case_file(
  p_incident_id uuid,
  p_facility_id uuid,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  case_file_id uuid,
  organization_id uuid,
  facility_id uuid,
  child_id uuid,
  parent_id uuid,
  acknowledged_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.incident_case_files%ROWTYPE;
  v_ack_at timestamptz := now();
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT icf.*
    INTO v_case
  FROM public.incident_case_files icf
  WHERE icf.incident_id = p_incident_id
    AND icf.facility_id = p_facility_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident case file not found in facility scope';
  END IF;

  IF v_case.parent_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'Incident is not parent-owned';
  END IF;

  UPDATE public.incident_case_files
  SET parent_acknowledged = true,
      parent_acknowledged_at = COALESCE(parent_acknowledged_at, v_ack_at),
      updated_at = now()
  WHERE id = v_case.id;

  INSERT INTO public.incident_case_actions (
    organization_id,
    facility_id,
    case_file_id,
    action_type,
    action_label,
    action_metadata,
    performed_by
  ) VALUES (
    v_case.organization_id,
    v_case.facility_id,
    v_case.id,
    'PARENT_ACKNOWLEDGED',
    'Parent acknowledged incident',
    jsonb_build_object('acknowledged_at', v_ack_at),
    p_actor_user_id
  );

  RETURN QUERY
  SELECT
    v_case.id,
    v_case.organization_id,
    v_case.facility_id,
    v_case.child_id,
    v_case.parent_id,
    v_ack_at;
END;
$$;

REVOKE ALL ON FUNCTION public.parent_acknowledge_incident_case_file(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parent_acknowledge_incident_case_file(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS incident_case_notes_select_policy ON public.incident_case_notes;
CREATE POLICY incident_case_notes_select_policy ON public.incident_case_notes
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS incident_case_notes_insert_policy ON public.incident_case_notes;
CREATE POLICY incident_case_notes_insert_policy ON public.incident_case_notes
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);

DROP POLICY IF EXISTS incident_case_actions_select_policy ON public.incident_case_actions;
CREATE POLICY incident_case_actions_select_policy ON public.incident_case_actions
FOR SELECT USING (
  (
    public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
    OR public.has_facility_or_organization_role(
      facility_id,
      ARRAY['ADMIN','BILLING','STAFF','CAREGIVER']::public.facility_role[],
      ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[]
    )
  )
  OR (
    EXISTS (
      SELECT 1
      FROM public.incident_case_files icf
      WHERE icf.id = incident_case_actions.case_file_id
        AND icf.parent_id = auth.uid()
        AND icf.facility_id = incident_case_actions.facility_id
    )
    AND action_type IN ('PARENT_NOTIFIED','PARENT_ACKNOWLEDGED','STATUS_CHANGED')
  )
);

DROP POLICY IF EXISTS incident_case_actions_insert_policy ON public.incident_case_actions;
CREATE POLICY incident_case_actions_insert_policy ON public.incident_case_actions
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_or_organization_role(
    facility_id,
    ARRAY['ADMIN','STAFF']::public.facility_role[],
    ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[]
  )
);
