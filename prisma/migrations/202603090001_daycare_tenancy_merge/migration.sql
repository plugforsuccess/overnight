BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('TRIALING','ACTIVE','PAST_DUE','CANCELED','UNPAID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_tier AS ENUM ('STARTER','PROFESSIONAL','ENTERPRISE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform_fee_type AS ENUM ('PERCENTAGE','FLAT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform_role AS ENUM ('PLATFORM_ADMIN','PLATFORM_SUPPORT','NONE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE facility_role AS ENUM ('ADMIN','BILLING','STAFF','CAREGIVER','PARENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform_audit_action AS ENUM ('SUSPEND','REACTIVATE','ARCHIVE','RESTORE','TOGGLE_FEATURED','TOGGLE_PUBLISHED','IMPERSONATION_START','IMPERSONATION_STOP','UPDATE_SPONSORED_STATUS','UPDATE_SUBSCRIPTION','UPDATE_FACILITY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform_resource_type AS ENUM ('FACILITY','LOCATION','SPONSORED_PLACEMENT','SUBSCRIPTION','USER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_email text,
  owner_name text,
  owner_phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  timezone text NOT NULL DEFAULT 'America/New_York',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status subscription_status NOT NULL DEFAULT 'TRIALING',
  subscription_tier subscription_tier NOT NULL DEFAULT 'STARTER',
  platform_fee_enabled boolean NOT NULL DEFAULT false,
  platform_fee_type platform_fee_type,
  platform_fee_percentage integer,
  platform_fee_flat_cents integer,
  platform_fee_min_cents integer,
  platform_fee_max_cents integer,
  is_active boolean NOT NULL DEFAULT true,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facilities_subscription_status ON public.facilities (subscription_status);
CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON public.facilities (is_active);
DROP TRIGGER IF EXISTS trg_facilities_updated_at ON public.facilities;
CREATE TRIGGER trg_facilities_updated_at BEFORE UPDATE ON public.facilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.facility_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role facility_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facility_memberships_unique UNIQUE (facility_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_facility_memberships_user_active ON public.facility_memberships (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_facility_memberships_facility_role_active ON public.facility_memberships (facility_id, role, is_active);
DROP TRIGGER IF EXISTS trg_facility_memberships_updated_at ON public.facility_memberships;
CREATE TRIGGER trg_facility_memberships_updated_at BEFORE UPDATE ON public.facility_memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  actor_platform_role platform_role NOT NULL,
  action platform_audit_action NOT NULL,
  resource_type platform_resource_type NOT NULL,
  resource_id uuid,
  facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_masked text,
  user_agent_truncated text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_facility_created ON public.platform_audit_logs (facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_action_created ON public.platform_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor_created ON public.platform_audit_logs (actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_fee_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  payment_cycle_id uuid,
  parent_payment_amount_cents integer NOT NULL CHECK (parent_payment_amount_cents >= 0),
  fee_type platform_fee_type NOT NULL,
  fee_amount_cents integer NOT NULL CHECK (fee_amount_cents >= 0),
  stripe_transfer_id text,
  stripe_payment_intent_id text,
  settled boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_fee_records_facility_settled_created ON public.platform_fee_records (facility_id, settled, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_fee_records_payment_cycle ON public.platform_fee_records (payment_cycle_id);

INSERT INTO public.facilities (id,name,slug,owner_email,subscription_status,subscription_tier,is_active)
VALUES ('00000000-0000-0000-0000-000000000001','Overnight Atlanta','overnight-atlanta',NULL,'ACTIVE','PROFESSIONAL',true)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  t text;
  scoped_tables text[] := ARRAY[
    'parents','children','child_medical_profiles','child_allergies','child_emergency_contacts','child_authorized_pickups','parent_settings',
    'reservations','reservation_nights','waitlist','attendance_records','child_attendance_sessions','pickup_verifications','incident_reports',
    'plans','overnight_blocks','programs','program_capacity','capacity_overrides','admin_settings','reservation_events','attendance_events',
    'capacity_override_events','child_events','pickup_events','billing_events','audit_log','idempotency_keys','health_check_runs','health_issues'
  ];
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS facility_id uuid', t);
      EXECUTE format('UPDATE public.%I SET facility_id = %L::uuid WHERE facility_id IS NULL', t, '00000000-0000-0000-0000-000000000001');
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_facility_id_fkey') THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE RESTRICT', t, t || '_facility_id_fkey');
      END IF;
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN facility_id SET NOT NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (facility_id)', 'idx_' || t || '_facility_id', t);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservation_nights_facility_care_date ON public.reservation_nights (facility_id, care_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_facility_created_at ON public.audit_log (facility_id, created_at DESC);

INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, au.id, 'ADMIN'::facility_role, true
FROM auth.users au
JOIN public.parents p ON p.id = au.id
WHERE COALESCE(p.is_admin, false) = true OR COALESCE(lower(p.role), '') IN ('admin', 'center_admin', 'super_admin')
ON CONFLICT (facility_id, user_id) DO NOTHING;

UPDATE public.facilities f
SET owner_email = admin_seed.email
FROM (
  SELECT lower(au.email) AS email
  FROM auth.users au
  JOIN public.parents p ON p.id = au.id
  WHERE (COALESCE(p.is_admin, false) = true OR COALESCE(lower(p.role), '') IN ('admin', 'center_admin', 'super_admin'))
    AND au.email IS NOT NULL
  ORDER BY au.created_at ASC
  LIMIT 1
) AS admin_seed
WHERE f.id = '00000000-0000-0000-0000-000000000001'::uuid
  AND (f.owner_email IS NULL OR f.owner_email = '' OR lower(f.owner_email) = 'owner@example.com');

CREATE OR REPLACE FUNCTION public.current_facility_id()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_facility_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION public.current_platform_role()
RETURNS platform_role LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('app.current_platform_role', true), '')::platform_role, 'NONE'::platform_role) $$;
CREATE OR REPLACE FUNCTION public.has_platform_role(roles platform_role[])
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.current_platform_role() = ANY (roles) $$;
CREATE OR REPLACE FUNCTION public.has_facility_role(target_facility_id uuid, roles facility_role[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.facility_memberships fm WHERE fm.facility_id = target_facility_id AND fm.user_id = auth.uid() AND fm.is_active = true AND fm.role = ANY (roles))
$$;

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fee_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facilities_select_policy ON public.facilities;
CREATE POLICY facilities_select_policy ON public.facilities FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::platform_role[])
  OR EXISTS (SELECT 1 FROM public.facility_memberships fm WHERE fm.facility_id = facilities.id AND fm.user_id = auth.uid() AND fm.is_active = true)
);
DROP POLICY IF EXISTS facilities_update_policy ON public.facilities;
CREATE POLICY facilities_update_policy ON public.facilities FOR UPDATE USING (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[])) WITH CHECK (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[]));

DROP POLICY IF EXISTS facility_memberships_select_policy ON public.facility_memberships;
CREATE POLICY facility_memberships_select_policy ON public.facility_memberships FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::platform_role[])
  OR user_id = auth.uid()
  OR public.has_facility_role(facility_id, ARRAY['ADMIN']::facility_role[])
);
DROP POLICY IF EXISTS facility_memberships_insert_policy ON public.facility_memberships;
CREATE POLICY facility_memberships_insert_policy ON public.facility_memberships FOR INSERT WITH CHECK (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[]));
DROP POLICY IF EXISTS facility_memberships_update_policy ON public.facility_memberships;
CREATE POLICY facility_memberships_update_policy ON public.facility_memberships FOR UPDATE USING (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[])) WITH CHECK (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[]));

DROP POLICY IF EXISTS platform_audit_logs_select_policy ON public.platform_audit_logs;
CREATE POLICY platform_audit_logs_select_policy ON public.platform_audit_logs FOR SELECT USING (public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::platform_role[]));
DROP POLICY IF EXISTS platform_audit_logs_insert_policy ON public.platform_audit_logs;
CREATE POLICY platform_audit_logs_insert_policy ON public.platform_audit_logs FOR INSERT WITH CHECK (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[]));

DROP POLICY IF EXISTS platform_fee_records_select_policy ON public.platform_fee_records;
CREATE POLICY platform_fee_records_select_policy ON public.platform_fee_records FOR SELECT USING (public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::platform_role[]));
DROP POLICY IF EXISTS platform_fee_records_insert_policy ON public.platform_fee_records;
CREATE POLICY platform_fee_records_insert_policy ON public.platform_fee_records FOR INSERT WITH CHECK (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[]));
DROP POLICY IF EXISTS platform_fee_records_update_policy ON public.platform_fee_records;
CREATE POLICY platform_fee_records_update_policy ON public.platform_fee_records FOR UPDATE USING (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[])) WITH CHECK (public.has_platform_role(ARRAY['PLATFORM_ADMIN']::platform_role[]));

COMMIT;
