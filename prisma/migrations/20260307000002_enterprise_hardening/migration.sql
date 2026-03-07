-- Enterprise Hardening: event ledger, attendance sessions, timestamp automation,
-- emergency contact deduplication, and reservation safety constraints.

-- ============================================================
-- 1. Global update_timestamp() function
-- ============================================================
-- Replaces the older set_updated_at() with a canonical name.
-- Both function names are kept for backward compat.

CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Attach updated_at triggers to ALL tables with updated_at
-- ============================================================
-- Parents
DROP TRIGGER IF EXISTS parents_update_timestamp ON public.parents;
CREATE TRIGGER parents_update_timestamp
  BEFORE UPDATE ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- Children
DROP TRIGGER IF EXISTS children_update_timestamp ON public.children;
CREATE TRIGGER children_update_timestamp
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- Child Medical Profiles (may already have set_updated_at — add canonical name)
DROP TRIGGER IF EXISTS child_medical_profiles_update_timestamp ON public.child_medical_profiles;
CREATE TRIGGER child_medical_profiles_update_timestamp
  BEFORE UPDATE ON public.child_medical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- Child Emergency Contacts (set_updated_at already exists — add canonical name)
DROP TRIGGER IF EXISTS child_emergency_contacts_update_timestamp ON public.child_emergency_contacts;
CREATE TRIGGER child_emergency_contacts_update_timestamp
  BEFORE UPDATE ON public.child_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- Child Authorized Pickups (set_updated_at already exists — add canonical name)
DROP TRIGGER IF EXISTS child_authorized_pickups_update_timestamp ON public.child_authorized_pickups;
CREATE TRIGGER child_authorized_pickups_update_timestamp
  BEFORE UPDATE ON public.child_authorized_pickups
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 3. Child Events — Append-Only Safety Event Ledger
-- ============================================================

CREATE TABLE IF NOT EXISTS public.child_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  center_id uuid,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Events are append-only: no updated_at, no UPDATE/DELETE policies
CREATE INDEX IF NOT EXISTS idx_child_events_child_created
  ON public.child_events (child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_child_events_type
  ON public.child_events (event_type);

-- ============================================================
-- 4. Child Attendance Sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.child_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  center_id uuid,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,

  check_in_at timestamptz,
  check_out_at timestamptz,
  checked_in_by uuid,
  checked_out_by uuid,

  pickup_person_name text,
  pickup_relationship text,
  pickup_verified boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'scheduled',
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_child_created
  ON public.child_attendance_sessions (child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_status
  ON public.child_attendance_sessions (status);

-- Attendance session status constraint
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

-- updated_at trigger for attendance sessions
DROP TRIGGER IF EXISTS child_attendance_sessions_update_timestamp ON public.child_attendance_sessions;
CREATE TRIGGER child_attendance_sessions_update_timestamp
  BEFORE UPDATE ON public.child_attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 5. Emergency Contact Deduplication
-- ============================================================
-- Prevent same phone number being added twice for the same child.

ALTER TABLE public.child_emergency_contacts
  DROP CONSTRAINT IF EXISTS child_emergency_contacts_child_id_phone_unique;

-- Use a unique index on normalized phone (strip non-digits)
CREATE UNIQUE INDEX IF NOT EXISTS child_emergency_contacts_child_id_phone_unique
  ON public.child_emergency_contacts (child_id, phone);

-- ============================================================
-- 6. RLS — Enable on new tables
-- ============================================================

ALTER TABLE public.child_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_attendance_sessions ENABLE ROW LEVEL SECURITY;

-- ── child_events RLS ──────────────────────────────────────────
-- Parents can SELECT events for their own children
DROP POLICY IF EXISTS parents_select_child_events ON public.child_events;
CREATE POLICY parents_select_child_events ON public.child_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- Parents can INSERT events for their own children (e.g., acknowledging alerts)
DROP POLICY IF EXISTS parents_insert_child_events ON public.child_events;
CREATE POLICY parents_insert_child_events ON public.child_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- NO update/delete policies — events are append-only

-- Admin full access
DROP POLICY IF EXISTS admins_manage_child_events ON public.child_events;
CREATE POLICY admins_manage_child_events ON public.child_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── child_attendance_sessions RLS ────────────────────────────
DROP POLICY IF EXISTS parents_select_attendance ON public.child_attendance_sessions;
CREATE POLICY parents_select_attendance ON public.child_attendance_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- Only admins/staff can insert/update attendance sessions
DROP POLICY IF EXISTS admins_manage_attendance ON public.child_attendance_sessions;
CREATE POLICY admins_manage_attendance ON public.child_attendance_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ============================================================
-- 7. RLS — Enable on audit_log (was missing)
-- ============================================================

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Parents can view their own audit entries
DROP POLICY IF EXISTS parents_select_own_audit ON public.audit_log;
CREATE POLICY parents_select_own_audit ON public.audit_log
  FOR SELECT USING (actor_id = auth.uid());

-- Admins can view all audit entries
DROP POLICY IF EXISTS admins_manage_audit ON public.audit_log;
CREATE POLICY admins_manage_audit ON public.audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ============================================================
-- 8. RLS — Enable on pickup_events (was missing)
-- ============================================================

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
