# Migration Repair Plan

1. Add a foundational migration that creates missing tables before dependent migrations, starting with `reservation_nights` and any other tables reported as SCHEMA_TABLE_MISSING_FROM_MIGRATIONS.
2. For each ordering violation, either (a) move the SQL into a later migration, or (b) add prerequisite create/add-column statements in an earlier migration.
3. For Supabase `auth.*` dependencies, gate them with existence checks or separate out into non-Prisma SQL bootstrap steps to keep shadow DB safe.
4. In already-deployed environments, do not rewrite applied migrations; create forward-fix migrations and mark history with `prisma migrate resolve` only when schema state is manually verified.
5. Validate with:
   - npx prisma migrate status
   - npx prisma migrate deploy
   - npm run audit:migrations

## Commands for current environment

`npm run audit:migrations`
`npx prisma migrate status`
`npx prisma migrate deploy`
