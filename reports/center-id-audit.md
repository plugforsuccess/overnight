# center_id audit report

Generated with:
- `rg -n "center_id|eq\('center_id'|eq\(\"center_id\"" src`
- `rg -n "center_id" prisma`
- `rg -n "center_id" supabase`

## Removed from production child/admin tenant scoping
- Child documents API switched to `facility_id` for reads and writes.
- Child immunization API switched to `facility_id` for reads and writes.
- Child medical profile API switched to `facility_id` for reads and writes.
- Child events API switched to `facility_id` for reads and writes.
- Child attendance API switched to `facility_id` for reads and writes.
- Child incidents API now writes `facility_id` and scopes reads by `facility_id`.
- Admin summary child count sourced from `children` with `facility_id`.
- Admin dashboard page now loads scoped summary from `/api/admin`.
- Admin safety route now scopes related table reads by `facility_id`.

## Remaining `center_id` references in `src` and classification
### Transitional (non-tenant scoping)
- `src/app/api/capacity/route.ts` and `src/app/api/bookings/route.ts`: legacy program/capacity compatibility fields.
- `src/app/api/admin/closures/route.ts`: program payload still includes `center_id` metadata.
- `src/lib/closures/*`: closure events still persist legacy `center_id` fields.
- `src/lib/health/*`: operational health telemetry still reads/writes `center_id` fields.
- `src/types/database.ts`, `src/types/children.ts`: compatibility type surfaces.

### Historical / safe
- `prisma/migrations/**`: immutable historical migrations.
- `supabase/rls-policies.sql`: legacy center/program functions not used for child/admin tenant scoping.

## Schema normalization status
- Added migration `202603090002_child_facility_normalization`.
- Adds/backfills/enforces `facility_id` on:
  - `child_documents`
  - `child_immunization_records`
- Backfills and hardens `facility_id` NOT NULL on:
  - `child_medical_profiles`
  - `child_events`

## Phase 4 (drop `center_id`)
Deferred until all remaining transitional usage above is removed.
