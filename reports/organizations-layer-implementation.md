# Organizations Layer Implementation Summary

## Migration order implemented
1. Create enum `organization_role`.
2. Create `organizations`.
3. Create `organization_memberships`.
4. Add nullable `facilities.organization_id`.
5. Insert a default organization row (derived name/email/phone when possible, fallback slug strategy).
6. Backfill all existing facilities to a selected organization.
7. Seed initial organization memberships from existing active facility memberships.
8. Set `facilities.organization_id` to `NOT NULL`.
9. Add FK/index hardening for `facilities.organization_id`.
10. Add helper SQL functions:
   - `current_organization_id()`
   - `has_organization_role(target_organization_id uuid, roles organization_role[])`
   - `has_facility_or_organization_role(...)`
11. Add RLS policies for `organizations` and `organization_memberships`.
12. Expand existing `facilities` and `facility_memberships` policies with organization-aware access.

## Backfill logic notes
- Default org uses the earliest facility metadata for naming and contact fields.
- Fallback naming still resolves to `Overnight Organization` and slug family rooted at `overnight-organization`.
- Owner user is derived from earliest active facility ADMIN membership when present.
- Membership seeding maps:
  - `ADMIN` -> `ORG_ADMIN` (earliest admin is promoted to `ORG_OWNER`)
  - `BILLING` -> `ORG_BILLING`
  - `STAFF` / `CAREGIVER` -> `ORG_SUPPORT`

## Verification queries
```sql
-- Every facility belongs to an organization
SELECT COUNT(*) AS unassigned_facilities
FROM public.facilities
WHERE organization_id IS NULL;

-- Organizations exist
SELECT id, name, slug, owner_user_id, status
FROM public.organizations
ORDER BY created_at ASC;

-- Organization memberships seeded
SELECT organization_id, role, is_active, COUNT(*)
FROM public.organization_memberships
GROUP BY 1,2,3
ORDER BY 1,2;

-- Ensure helper functions are present
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('current_organization_id', 'has_organization_role', 'has_facility_or_organization_role')
ORDER BY proname;

-- RLS enabled on new tables
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('organizations', 'organization_memberships')
ORDER BY relname;
```

## Migration risk notes
- `ALTER TABLE ... SET NOT NULL` on `facilities.organization_id` acquires an ACCESS EXCLUSIVE lock briefly.
- Backfill update touches all facilities with null `organization_id`; size-dependent write amplification.
- Policy replacement on `facilities`/`facility_memberships` can alter effective access if existing custom policies exist outside migrations.

## Lock-risk notes
- Highest lock risk: `ALTER TABLE public.facilities ALTER COLUMN organization_id SET NOT NULL`.
- Moderate lock risk: adding foreign key constraint on `facilities.organization_id`.
- Low lock risk: creating new tables/indexes/functions/policies.

## Manual post-deploy checks
1. Verify single-center admin can still access all current facility-admin routes.
2. Verify parent/guardian can only access own child records (no org-level bypass for parent-private data).
3. Verify organization roles:
   - ORG_SUPPORT can read org membership data but cannot mutate.
   - ORG_ADMIN can manage memberships.
   - ORG_OWNER can perform archive/suspend status changes.
4. Verify active org/facility header resolution:
   - `x-organization-id` + `x-facility-id` combinations are consistent.

## Unresolved risks
- `organizations.status` constraint exists at DB level but Prisma currently models status as `String`; app-layer validation should enforce canonical values until enum/check modeling is tightened.
- If no active facility memberships exist in production, owner/membership seed may be intentionally sparse and require manual grant.


## Deployment Safety Check (required)

```sql
-- 1) Facilities backfill worked (expect 0 rows)
SELECT id, organization_id
FROM facilities
WHERE organization_id IS NULL;

-- 2) Organization memberships exist (expect at least one admin/owner)
SELECT *
FROM organization_memberships
LIMIT 10;
```

### Facility flow regression smoke test
- Parent login
- Create child
- Book reservation
- Check in
- Check out
