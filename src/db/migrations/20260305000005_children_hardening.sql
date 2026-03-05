-- ============================================================
-- Migration: Children Hardening
-- Supabase SQL version (includes RLS policies)
-- ============================================================

-- Helper: updated_at trigger (already exists but ensure it's there)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. Alter children: split name → first_name + last_name
-- ============================================================
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.children ADD COLUMN IF NOT EXISTS last_name text;

DO $$
DECLARE
  src_col text;
BEGIN
  -- Determine which legacy column exists: full_name or name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'full_name'
  ) THEN
    src_col := 'full_name';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'name'
  ) THEN
    src_col := 'name';
  ELSE
    src_col := NULL;
  END IF;

  IF src_col IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.children
       SET first_name = CASE
             WHEN position('' '' in COALESCE(%I, '''')) > 0
               THEN left(COALESCE(%I, ''''), position('' '' in COALESCE(%I, '''')) - 1)
             ELSE COALESCE(%I, '''')
           END,
           last_name = CASE
             WHEN position('' '' in COALESCE(%I, '''')) > 0
               THEN substring(COALESCE(%I, '''') from position('' '' in COALESCE(%I, '''')) + 1)
             ELSE ''''
           END
       WHERE first_name IS NULL',
      src_col, src_col, src_col, src_col, src_col, src_col, src_col
    );
  END IF;
END $$;

ALTER TABLE public.children ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE public.children ALTER COLUMN last_name SET NOT NULL;

-- ============================================================
-- 2. Create enums
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allergy_type') THEN
    CREATE TYPE public.allergy_type AS ENUM (
      'PEANUT','TREE_NUT','MILK','EGG','WHEAT','SOY','FISH','SHELLFISH','SESAME',
      'PENICILLIN','INSECT_STING','LATEX','ASTHMA','ENVIRONMENTAL','OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'allergy_severity') THEN
    CREATE TYPE public.allergy_severity AS ENUM ('UNKNOWN','MILD','MODERATE','SEVERE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'treatment_type') THEN
    CREATE TYPE public.treatment_type AS ENUM (
      'NONE','ANTIHISTAMINE','EPINEPHRINE_AUTOINJECTOR','INHALER','CALL_911','OTHER'
    );
  END IF;
END $$;

-- ============================================================
-- 3. child_allergies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.child_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  allergen public.allergy_type NOT NULL,
  custom_label text NULL,
  severity public.allergy_severity NOT NULL DEFAULT 'UNKNOWN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_child_allergies_unique
  ON public.child_allergies (child_id, allergen, COALESCE(custom_label, ''));

CREATE INDEX IF NOT EXISTS idx_child_allergies_child_id ON public.child_allergies(child_id);

CREATE TRIGGER child_allergies_set_updated_at
BEFORE UPDATE ON public.child_allergies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. child_allergy_action_plans
-- ============================================================
CREATE TABLE IF NOT EXISTS public.child_allergy_action_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_allergy_id uuid NOT NULL UNIQUE REFERENCES public.child_allergies(id) ON DELETE CASCADE,
  treatment_first_line public.treatment_type NOT NULL DEFAULT 'NONE',
  dose_instructions text NULL,
  symptoms_watch jsonb NULL,
  med_location text NULL,
  requires_med_on_site boolean NOT NULL DEFAULT false,
  medication_expires_on date NULL,
  physician_name text NULL,
  parent_confirmed boolean NOT NULL DEFAULT false,
  parent_confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER child_allergy_action_plans_set_updated_at
BEFORE UPDATE ON public.child_allergy_action_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. child_emergency_contacts (max 2 per child)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.child_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,
  phone_alt text NULL,
  priority smallint NOT NULL DEFAULT 1,
  authorized_for_pickup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, priority)
);

CREATE INDEX IF NOT EXISTS idx_child_emergency_contacts_child_id ON public.child_emergency_contacts(child_id);

CREATE TRIGGER child_emergency_contacts_set_updated_at
BEFORE UPDATE ON public.child_emergency_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce max 2 contacts per child
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

DROP TRIGGER IF EXISTS trg_max_two_emergency_contacts ON public.child_emergency_contacts;
CREATE TRIGGER trg_max_two_emergency_contacts
BEFORE INSERT OR UPDATE ON public.child_emergency_contacts
FOR EACH ROW EXECUTE FUNCTION public.enforce_max_two_emergency_contacts();

-- ============================================================
-- 6. child_authorized_pickups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.child_authorized_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  relationship text NOT NULL,
  phone text NOT NULL,
  pickup_pin_hash text NOT NULL,
  id_verified boolean NOT NULL DEFAULT false,
  id_verified_at timestamptz NULL,
  id_verified_by uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_child_authorized_pickups_child_id ON public.child_authorized_pickups(child_id);

CREATE TRIGGER child_authorized_pickups_set_updated_at
BEFORE UPDATE ON public.child_authorized_pickups
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE public.child_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_allergy_action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_authorized_pickups ENABLE ROW LEVEL SECURITY;

-- child_allergies: parent access via child ownership
CREATE POLICY "parents_select_child_allergies"
ON public.child_allergies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_allergies.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_insert_child_allergies"
ON public.child_allergies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_allergies.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_update_child_allergies"
ON public.child_allergies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_allergies.child_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_allergies.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_delete_child_allergies"
ON public.child_allergies FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_allergies.child_id
      AND c.user_id = auth.uid()
  )
);

-- child_allergy_action_plans: parent access via allergy -> child
CREATE POLICY "parents_select_action_plans"
ON public.child_allergy_action_plans FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_action_plans.child_allergy_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_insert_action_plans"
ON public.child_allergy_action_plans FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_action_plans.child_allergy_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_update_action_plans"
ON public.child_allergy_action_plans FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_action_plans.child_allergy_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_action_plans.child_allergy_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_delete_action_plans"
ON public.child_allergy_action_plans FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.child_allergies a
    JOIN public.children c ON c.id = a.child_id
    WHERE a.id = child_allergy_action_plans.child_allergy_id
      AND c.user_id = auth.uid()
  )
);

-- child_emergency_contacts: parent access via child
CREATE POLICY "parents_select_emergency_contacts"
ON public.child_emergency_contacts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_emergency_contacts.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_insert_emergency_contacts"
ON public.child_emergency_contacts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_emergency_contacts.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_update_emergency_contacts"
ON public.child_emergency_contacts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_emergency_contacts.child_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_emergency_contacts.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_delete_emergency_contacts"
ON public.child_emergency_contacts FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_emergency_contacts.child_id
      AND c.user_id = auth.uid()
  )
);

-- child_authorized_pickups: parent access via child
CREATE POLICY "parents_select_authorized_pickups"
ON public.child_authorized_pickups FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_authorized_pickups.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_insert_authorized_pickups"
ON public.child_authorized_pickups FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_authorized_pickups.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_update_authorized_pickups"
ON public.child_authorized_pickups FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_authorized_pickups.child_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_authorized_pickups.child_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "parents_delete_authorized_pickups"
ON public.child_authorized_pickups FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_authorized_pickups.child_id
      AND c.user_id = auth.uid()
  )
);

-- Admin access policies for new tables
CREATE POLICY "admins_manage_child_allergies"
ON public.child_allergies FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "admins_manage_action_plans"
ON public.child_allergy_action_plans FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "admins_manage_emergency_contacts"
ON public.child_emergency_contacts FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "admins_manage_authorized_pickups"
ON public.child_authorized_pickups FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
