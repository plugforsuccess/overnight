-- Harden Parent Onboarding: schema updates for child medical profiles,
-- onboarding state tracking, and multi-center preparation.

-- Ensure set_updated_at() exists (created by legacy Supabase/Knex setup;
-- needed for the trigger below). CREATE OR REPLACE is safe if it already exists.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. Parents: add onboarding_status and center_id
-- ============================================================

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS center_id uuid,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'started';

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

-- ============================================================
-- 2. Children: add new optional fields
-- ============================================================

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS center_id uuid;

-- ============================================================
-- 3. Child Medical Profiles (new table)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.child_medical_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL UNIQUE REFERENCES public.children(id) ON DELETE CASCADE,
  center_id uuid,

  has_allergies boolean NOT NULL DEFAULT false,
  has_medications boolean NOT NULL DEFAULT false,
  has_medical_conditions boolean NOT NULL DEFAULT false,

  allergies_summary text,
  medications_summary text,
  medical_conditions_summary text,

  physician_name text,
  physician_phone text,
  hospital_preference text,

  special_instructions text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS child_medical_profiles_set_updated_at ON public.child_medical_profiles;
CREATE TRIGGER child_medical_profiles_set_updated_at
  BEFORE UPDATE ON public.child_medical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. Emergency Contacts: add email, is_primary, center_id
-- ============================================================

ALTER TABLE public.child_emergency_contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS center_id uuid;

-- ============================================================
-- 5. Authorized Pickups: add email, dob, photo_id_url,
--    is_emergency_contact, is_active, center_id
--    Make pickup_pin_hash nullable (skippable during onboarding)
-- ============================================================

ALTER TABLE public.child_authorized_pickups
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS photo_id_url text,
  ADD COLUMN IF NOT EXISTS is_emergency_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS center_id uuid;

-- Make pickup_pin_hash nullable if it isn't already
ALTER TABLE public.child_authorized_pickups
  ALTER COLUMN pickup_pin_hash DROP NOT NULL;

-- ============================================================
-- 6. RLS for child_medical_profiles
-- ============================================================

ALTER TABLE public.child_medical_profiles ENABLE ROW LEVEL SECURITY;

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

-- ============================================================
-- 7. Backfill onboarding_status for existing parents
--    If a parent already has children and emergency contacts,
--    mark them as 'complete'.
-- ============================================================

UPDATE public.parents p
SET onboarding_status = 'complete'
WHERE EXISTS (
  SELECT 1 FROM public.children c
  WHERE c.parent_id = p.id
)
AND EXISTS (
  SELECT 1 FROM public.children c
  JOIN public.child_emergency_contacts ec ON ec.child_id = c.id
  WHERE c.parent_id = p.id
)
AND p.onboarding_status = 'started';
