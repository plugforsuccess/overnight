-- Operational Hardening: reservation events, incident reports, staff membership,
-- attendance state machine, pickup verifications.

-- ============================================================
-- 1. Reservation Events — Append-Only Ledger
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reservation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservation_events_res_created
  ON public.reservation_events (reservation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reservation_events_type
  ON public.reservation_events (event_type);

-- ============================================================
-- 2. Incident Reports — First-Class Structured Records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  attendance_session_id uuid REFERENCES public.child_attendance_sessions(id) ON DELETE SET NULL,
  center_id uuid,

  severity text NOT NULL,
  category text NOT NULL,
  summary text NOT NULL,
  details text,

  reported_by uuid,
  parent_notified_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'open',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_child_created
  ON public.incident_reports (child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_incident_reports_status
  ON public.incident_reports (status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_severity
  ON public.incident_reports (severity);

ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS chk_incident_severity;
ALTER TABLE public.incident_reports ADD CONSTRAINT chk_incident_severity
  CHECK (severity IN ('low', 'medium', 'high', 'critical'));

ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS chk_incident_status;
ALTER TABLE public.incident_reports ADD CONSTRAINT chk_incident_status
  CHECK (status IN ('open', 'investigating', 'resolved', 'closed'));

-- updated_at trigger
DROP TRIGGER IF EXISTS incident_reports_update_timestamp ON public.incident_reports;
CREATE TRIGGER incident_reports_update_timestamp
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 3. Center Staff Memberships — Multi-Center Role Normalization
-- ============================================================

CREATE TABLE IF NOT EXISTS public.center_staff_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  center_id uuid NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS center_staff_memberships_user_center_unique
  ON public.center_staff_memberships (user_id, center_id);
CREATE INDEX IF NOT EXISTS idx_staff_memberships_center_active
  ON public.center_staff_memberships (center_id, active);

ALTER TABLE public.center_staff_memberships DROP CONSTRAINT IF EXISTS chk_staff_role;
ALTER TABLE public.center_staff_memberships ADD CONSTRAINT chk_staff_role
  CHECK (role IN ('staff', 'admin', 'center_admin', 'super_admin'));

-- updated_at trigger
DROP TRIGGER IF EXISTS center_staff_memberships_update_timestamp ON public.center_staff_memberships;
CREATE TRIGGER center_staff_memberships_update_timestamp
  BEFORE UPDATE ON public.center_staff_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ============================================================
-- 4. Pickup Verifications — Dedicated Immutable Record
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pickup_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id uuid NOT NULL UNIQUE REFERENCES public.child_attendance_sessions(id) ON DELETE CASCADE,
  authorized_pickup_id uuid,
  verified_name text NOT NULL,
  verified_relationship text NOT NULL,
  verification_method text NOT NULL,
  verified_by uuid,
  verified_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pickup_verifications_verified_at
  ON public.pickup_verifications (verified_at);

-- ============================================================
-- 5. Attendance State Machine — DB-Level Enforcement
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_attendance_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  valid boolean := false;
BEGIN
  -- Allow any status on INSERT
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, enforce valid transitions
  IF OLD.status = NEW.status THEN
    -- No status change, allow
    RETURN NEW;
  END IF;

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
      valid := false; -- Terminal state
    WHEN 'cancelled' THEN
      valid := false; -- Terminal state
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
-- 6. RLS — Enable on new tables
-- ============================================================

ALTER TABLE public.reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.center_staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_verifications ENABLE ROW LEVEL SECURITY;

-- ── reservation_events RLS ───────────────────────────────────
-- Parents can view events for reservations on their children
DROP POLICY IF EXISTS parents_select_reservation_events ON public.reservation_events;
CREATE POLICY parents_select_reservation_events ON public.reservation_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      JOIN public.overnight_blocks ob ON ob.id = r.overnight_block_id
      WHERE r.id = reservation_id AND ob.parent_id = auth.uid()
    )
  );

-- No parent insert/update/delete — system-managed append-only
DROP POLICY IF EXISTS admins_manage_reservation_events ON public.reservation_events;
CREATE POLICY admins_manage_reservation_events ON public.reservation_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── incident_reports RLS ─────────────────────────────────────
DROP POLICY IF EXISTS parents_select_incident_reports ON public.incident_reports;
CREATE POLICY parents_select_incident_reports ON public.incident_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid())
  );

-- Only admins can manage incidents
DROP POLICY IF EXISTS admins_manage_incident_reports ON public.incident_reports;
CREATE POLICY admins_manage_incident_reports ON public.incident_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── center_staff_memberships RLS ─────────────────────────────
-- Users can view their own memberships
DROP POLICY IF EXISTS users_select_own_memberships ON public.center_staff_memberships;
CREATE POLICY users_select_own_memberships ON public.center_staff_memberships
  FOR SELECT USING (user_id = auth.uid());

-- Admins can manage all memberships
DROP POLICY IF EXISTS admins_manage_memberships ON public.center_staff_memberships;
CREATE POLICY admins_manage_memberships ON public.center_staff_memberships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );

-- ── pickup_verifications RLS ─────────────────────────────────
-- Parents can view verifications for their children's sessions
DROP POLICY IF EXISTS parents_select_pickup_verifications ON public.pickup_verifications;
CREATE POLICY parents_select_pickup_verifications ON public.pickup_verifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.child_attendance_sessions cas
      JOIN public.children c ON c.id = cas.child_id
      WHERE cas.id = attendance_session_id AND c.parent_id = auth.uid()
    )
  );

-- Only admins can insert verifications
DROP POLICY IF EXISTS admins_manage_pickup_verifications ON public.pickup_verifications;
CREATE POLICY admins_manage_pickup_verifications ON public.pickup_verifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.parents p WHERE p.id = auth.uid() AND (p.role = 'admin' OR p.is_admin))
  );
