# Operational Table Tenancy Standard

All **new operational tables** must include both:

- `organization_id uuid not null`
- `facility_id uuid not null`

## Required rule

`organization_id` must always match the parent facility organization:

- `organization_id = facilities.organization_id` for the row's `facility_id`

## Recommended DDL pattern

```sql
CREATE TABLE public.example_operational_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
  -- table-specific columns...
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_example_operational_table_org_id ON public.example_operational_table (organization_id);
CREATE INDEX idx_example_operational_table_facility_id ON public.example_operational_table (facility_id);

CREATE TRIGGER trg_example_operational_table_org_facility_match
BEFORE INSERT OR UPDATE ON public.example_operational_table
FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_matches_facility();
```

## Why this is required

- Faster analytics and reporting by org and facility
- Cleaner multi-location billing joins
- Safer RLS authoring with explicit tenancy keys
- Avoids expensive downstream schema rewrites

## Applies to patterns such as

- `staff_tasks`
- `staff_shifts`
- `care_events`
- `parent_notifications`
- `child_documents`

(Existing legacy tables can be migrated incrementally; this standard is mandatory for new operational tables.)
