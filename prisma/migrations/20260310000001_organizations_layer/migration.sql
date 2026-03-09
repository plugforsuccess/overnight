BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Phase 1: enum + base tables
DO $$
BEGIN
  CREATE TYPE public.organization_role AS ENUM ('ORG_OWNER', 'ORG_ADMIN', 'ORG_BILLING', 'ORG_SUPPORT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_email text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations (status);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id ON public.organizations (owner_user_id);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.organization_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_unique UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org_role_active ON public.organization_memberships (organization_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user_active ON public.organization_memberships (user_id, is_active);

DROP TRIGGER IF EXISTS trg_organization_memberships_updated_at ON public.organization_memberships;
CREATE TRIGGER trg_organization_memberships_updated_at
BEFORE UPDATE ON public.organization_memberships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add nullable facilities.organization_id first (additive + safe)
ALTER TABLE public.facilities
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill one default organization for existing single-center deployments
WITH candidate AS (
  SELECT
    COALESCE(NULLIF(trim(f.owner_name), ''), NULLIF(trim(f.name), ''), 'Overnight Organization') AS derived_name,
    COALESCE(NULLIF(lower(trim(f.owner_email)), ''), NULL) AS derived_billing_email,
    COALESCE(NULLIF(trim(f.owner_phone), ''), NULL) AS derived_phone
  FROM public.facilities f
  ORDER BY f.created_at ASC, f.id ASC
  LIMIT 1
),
admin_seed AS (
  SELECT fm.user_id
  FROM public.facility_memberships fm
  WHERE fm.is_active = true
    AND fm.role = 'ADMIN'::public.facility_role
  ORDER BY fm.created_at ASC, fm.id ASC
  LIMIT 1
),
slug_candidate AS (
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM public.organizations o WHERE o.slug = 'overnight-organization')
        THEN 'overnight-organization-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
      ELSE 'overnight-organization'
    END AS slug
),
inserted_org AS (
  INSERT INTO public.organizations (name, slug, owner_user_id, billing_email, phone, status)
  SELECT
    c.derived_name,
    s.slug,
    a.user_id,
    c.derived_billing_email,
    c.derived_phone,
    'active'
  FROM candidate c
  CROSS JOIN slug_candidate s
  LEFT JOIN admin_seed a ON true
  WHERE EXISTS (SELECT 1 FROM public.facilities)
    AND NOT EXISTS (
      SELECT 1 FROM public.facilities f WHERE f.organization_id IS NOT NULL
    )
  RETURNING id
),
selected_org AS (
  SELECT id FROM inserted_org
  UNION ALL
  SELECT f.organization_id AS id
  FROM public.facilities f
  WHERE f.organization_id IS NOT NULL
  ORDER BY 1
  LIMIT 1
)
UPDATE public.facilities f
SET organization_id = (SELECT id FROM selected_org LIMIT 1)
WHERE f.organization_id IS NULL
  AND EXISTS (SELECT 1 FROM selected_org);

-- Seed organization memberships from existing active facility admins/billing/staff where safely derivable
WITH target_org AS (
  SELECT DISTINCT f.organization_id AS organization_id
  FROM public.facilities f
  WHERE f.organization_id IS NOT NULL
  ORDER BY organization_id
  LIMIT 1
),
seed_candidates AS (
  SELECT
    t.organization_id,
    fm.user_id,
    CASE
      WHEN fm.role = 'ADMIN'::public.facility_role THEN 'ORG_ADMIN'::public.organization_role
      WHEN fm.role = 'BILLING'::public.facility_role THEN 'ORG_BILLING'::public.organization_role
      WHEN fm.role IN ('STAFF'::public.facility_role, 'CAREGIVER'::public.facility_role) THEN 'ORG_SUPPORT'::public.organization_role
      ELSE NULL
    END AS derived_org_role,
    fm.created_at,
    row_number() OVER (ORDER BY fm.created_at ASC, fm.id ASC) AS admin_rank
  FROM public.facility_memberships fm
  JOIN public.facilities f ON f.id = fm.facility_id
  JOIN target_org t ON t.organization_id = f.organization_id
  WHERE fm.is_active = true
    AND fm.role IN ('ADMIN'::public.facility_role, 'BILLING'::public.facility_role, 'STAFF'::public.facility_role, 'CAREGIVER'::public.facility_role)
),
upserted AS (
  INSERT INTO public.organization_memberships (organization_id, user_id, role, is_active)
  SELECT
    sc.organization_id,
    sc.user_id,
    CASE
      WHEN sc.admin_rank = 1 AND sc.derived_org_role = 'ORG_ADMIN'::public.organization_role THEN 'ORG_OWNER'::public.organization_role
      ELSE sc.derived_org_role
    END,
    true
  FROM seed_candidates sc
  WHERE sc.derived_org_role IS NOT NULL
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    is_active = EXCLUDED.is_active,
    role = CASE
      WHEN public.organization_memberships.role = 'ORG_OWNER'::public.organization_role THEN public.organization_memberships.role
      ELSE EXCLUDED.role
    END,
    updated_at = now()
  RETURNING organization_id, user_id, role
)
UPDATE public.organizations o
SET owner_user_id = u.user_id
FROM (
  SELECT u.organization_id, u.user_id
  FROM upserted u
  WHERE u.role = 'ORG_OWNER'::public.organization_role
  ORDER BY u.organization_id, u.user_id
) u
WHERE o.id = u.organization_id
  AND o.owner_user_id IS NULL;

-- Lock in required tenancy link after backfill
ALTER TABLE public.facilities
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.facilities
  DROP CONSTRAINT IF EXISTS facilities_organization_id_fkey;
ALTER TABLE public.facilities
  ADD CONSTRAINT facilities_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_facilities_organization_id ON public.facilities (organization_id);

-- Organization-aware helper SQL
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.has_organization_role(target_organization_id uuid, roles public.organization_role[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    WHERE om.organization_id = target_organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role = ANY (roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_facility_or_organization_role(target_facility_id uuid, facility_roles public.facility_role[], organization_roles public.organization_role[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    public.has_facility_role(target_facility_id, facility_roles)
    OR EXISTS (
      SELECT 1
      FROM public.facilities f
      WHERE f.id = target_facility_id
        AND public.has_organization_role(f.organization_id, organization_roles)
    )
$$;

-- RLS for new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_policy ON public.organizations;
CREATE POLICY organizations_select_policy ON public.organizations
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  )
);

DROP POLICY IF EXISTS organizations_update_policy ON public.organizations;
CREATE POLICY organizations_update_policy ON public.organizations
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_organization_role(organizations.id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR (
    public.has_organization_role(organizations.id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
    AND (
      organizations.status = 'active'
      OR public.has_organization_role(organizations.id, ARRAY['ORG_OWNER']::public.organization_role[])
    )
  )
);

DROP POLICY IF EXISTS organization_memberships_select_policy ON public.organization_memberships;
CREATE POLICY organization_memberships_select_policy ON public.organization_memberships
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR organization_memberships.user_id = auth.uid()
  OR public.has_organization_role(organization_memberships.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
);

DROP POLICY IF EXISTS organization_memberships_insert_policy ON public.organization_memberships;
CREATE POLICY organization_memberships_insert_policy ON public.organization_memberships
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_organization_role(organization_memberships.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
);

DROP POLICY IF EXISTS organization_memberships_update_policy ON public.organization_memberships;
CREATE POLICY organization_memberships_update_policy ON public.organization_memberships
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_organization_role(organization_memberships.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_organization_role(organization_memberships.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
);

-- Expand existing policies where organization-level admin access is appropriate.
DROP POLICY IF EXISTS facilities_select_policy ON public.facilities;
CREATE POLICY facilities_select_policy ON public.facilities
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR EXISTS (
    SELECT 1 FROM public.facility_memberships fm
    WHERE fm.facility_id = facilities.id
      AND fm.user_id = auth.uid()
      AND fm.is_active = true
  )
  OR public.has_organization_role(facilities.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN','ORG_BILLING','ORG_SUPPORT']::public.organization_role[])
);

DROP POLICY IF EXISTS facilities_update_policy ON public.facilities;
CREATE POLICY facilities_update_policy ON public.facilities
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_role(facilities.id, ARRAY['ADMIN']::public.facility_role[])
  OR public.has_organization_role(facilities.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR public.has_facility_role(facilities.id, ARRAY['ADMIN']::public.facility_role[])
  OR public.has_organization_role(facilities.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
);

DROP POLICY IF EXISTS facility_memberships_select_policy ON public.facility_memberships;
CREATE POLICY facility_memberships_select_policy ON public.facility_memberships
FOR SELECT USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN','PLATFORM_SUPPORT']::public.platform_role[])
  OR user_id = auth.uid()
  OR public.has_facility_role(facility_id, ARRAY['ADMIN']::public.facility_role[])
  OR EXISTS (
    SELECT 1 FROM public.facilities f
    WHERE f.id = facility_memberships.facility_id
      AND public.has_organization_role(f.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN','ORG_SUPPORT']::public.organization_role[])
  )
);

DROP POLICY IF EXISTS facility_memberships_insert_policy ON public.facility_memberships;
CREATE POLICY facility_memberships_insert_policy ON public.facility_memberships
FOR INSERT WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR EXISTS (
    SELECT 1 FROM public.facilities f
    WHERE f.id = facility_memberships.facility_id
      AND public.has_organization_role(f.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
  )
);

DROP POLICY IF EXISTS facility_memberships_update_policy ON public.facility_memberships;
CREATE POLICY facility_memberships_update_policy ON public.facility_memberships
FOR UPDATE USING (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR EXISTS (
    SELECT 1 FROM public.facilities f
    WHERE f.id = facility_memberships.facility_id
      AND public.has_organization_role(f.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
  )
)
WITH CHECK (
  public.has_platform_role(ARRAY['PLATFORM_ADMIN']::public.platform_role[])
  OR EXISTS (
    SELECT 1 FROM public.facilities f
    WHERE f.id = facility_memberships.facility_id
      AND public.has_organization_role(f.organization_id, ARRAY['ORG_OWNER','ORG_ADMIN']::public.organization_role[])
  )
);

COMMIT;
