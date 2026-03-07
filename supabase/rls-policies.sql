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
