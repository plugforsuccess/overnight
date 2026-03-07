# Prisma Migration Recovery Runbook

Production-safe procedures for diagnosing and resolving failed, stuck, or
inconsistent Prisma migrations against Supabase Postgres.

> **Prisma is the source of truth** for migration history. Avoid direct edits
> to `_prisma_migrations` unless every other option has been exhausted and the
> reason is documented in writing.

---

## Quick Reference

| Scenario | Command |
|----------|---------|
| Check migration health | `./scripts/check-migration-state.sh` |
| Check Prisma status only | `npx prisma migrate status` |
| Schema already applied, metadata stuck | `npx prisma migrate resolve --applied <name>` |
| Schema NOT applied, metadata stuck | `npx prisma migrate resolve --rolled-back <name>` then fix + re-deploy |
| Apply pending migrations | `npx prisma migrate deploy` |

---

## 1. Diagnose — Inspect Migration State

### 1a. Run the diagnostic script

```bash
# Requires DATABASE_URL or DIRECT_URL set
./scripts/check-migration-state.sh
```

This checks:
- `npx prisma migrate status` output
- Raw `_prisma_migrations` rows (state, timestamps, logs)
- Whether required tables exist in the database
- Whether required functions/triggers exist
- Whether RLS is enabled on expected tables

### 1b. Manual inspection (if the script is unavailable)

```bash
# Prisma's view of migration state
npx prisma migrate status

# Raw migration history from Postgres
psql $DATABASE_URL -c "
  SELECT migration_name, started_at, finished_at, rolled_back_at,
         LEFT(logs, 200) AS logs_preview
  FROM _prisma_migrations
  ORDER BY started_at DESC;
"
```

### 1c. Interpret the results

| `finished_at` | `rolled_back_at` | State | Meaning |
|---------------|------------------|-------|---------|
| Set | NULL | **Applied** | Migration completed successfully |
| NULL | NULL | **Failed** | Migration started but did not finish |
| NULL | Set | **Rolled back** | Migration was explicitly rolled back |

A migration in the **Failed** state blocks all subsequent migrations.

---

## 2. Compare — Schema Reality vs Prisma Metadata

Before resolving, determine whether the migration's SQL was partially or fully
applied to the actual database. This decides whether you use `--applied` or
`--rolled-back`.

### Check tables

```bash
# Check if a specific table exists
psql $DATABASE_URL -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
"
```

### Check functions

```bash
psql $DATABASE_URL -c "
  SELECT proname FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  ORDER BY proname;
"
```

### Check triggers

```bash
psql $DATABASE_URL -c "
  SELECT trigger_name, event_object_table, action_statement
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  ORDER BY event_object_table, trigger_name;
"
```

### Check RLS policies

```bash
psql $DATABASE_URL -c "
  SELECT tablename, policyname FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
"
```

---

## 3. Resolve — Pick the Right Strategy

### Scenario A: Schema IS fully present, only metadata is stuck

The migration SQL ran completely but Prisma recorded a failure (e.g., a
post-migration hook or timeout caused the "failed" state).

```bash
npx prisma migrate resolve --applied 20260307000002_enterprise_hardening
```

This tells Prisma: "the database already has this migration's changes — mark
it as applied."

Then verify:

```bash
npx prisma migrate status
npx prisma migrate deploy   # should proceed to next migration
```

### Scenario B: Schema is NOT fully present (partial failure)

The migration failed partway through — some tables/columns exist, others don't.

**Option 1 — Roll back and re-deploy (preferred)**

```bash
# Mark as rolled back
npx prisma migrate resolve --rolled-back 20260307000002_enterprise_hardening

# Fix the migration SQL if needed (make it idempotent)
# Then re-apply all pending migrations
npx prisma migrate deploy
```

This works when the migration SQL uses idempotent DDL (`CREATE TABLE IF NOT
EXISTS`, `DROP TRIGGER IF EXISTS`, etc.) — which all our migrations do.

**Option 2 — Complete the migration manually, then mark as applied**

If the migration is not idempotent and cannot be re-run:

```bash
# 1. Manually apply the missing parts
psql $DATABASE_URL -f <partial-fix.sql>

# 2. Mark as applied
npx prisma migrate resolve --applied <migration_name>

# 3. Verify
npx prisma migrate status
```

### Scenario C: Migration needs to be rewritten

If the migration SQL itself is wrong (references non-existent tables, has
syntax errors, etc.):

```bash
# 1. Roll back the failed migration metadata
npx prisma migrate resolve --rolled-back <migration_name>

# 2. Fix the migration SQL file in prisma/migrations/<name>/migration.sql
# 3. Re-deploy
npx prisma migrate deploy

# 4. Verify
npx prisma migrate status
```

---

## 4. When to Use `--applied` vs `--rolled-back`

| Use `--applied` when... | Use `--rolled-back` when... |
|-------------------------|-----------------------------|
| All schema objects from the migration exist in the DB | Some or all schema objects are missing |
| The failure was metadata-only (timeout, hook failure) | The SQL itself failed partway through |
| You manually completed the remaining DDL | The migration SQL is idempotent and safe to re-run |
| You want Prisma to skip this migration | You want Prisma to attempt this migration again |

---

## 5. When Manual SQL Is Appropriate

Direct SQL against `_prisma_migrations` should be a **last resort**. Valid
reasons:

- Prisma CLI is unavailable or broken
- The `_prisma_migrations` table has corruption that `prisma migrate resolve`
  cannot fix
- You need to batch-resolve multiple migrations in a single transaction

If you must use raw SQL:

```sql
-- Mark a failed migration as applied
UPDATE _prisma_migrations
  SET finished_at = now(), rolled_back_at = NULL,
      logs = 'Manually resolved: <reason>'
  WHERE migration_name = '<name>' AND finished_at IS NULL;

-- Mark a failed migration as rolled back
UPDATE _prisma_migrations
  SET rolled_back_at = now(),
      logs = 'Manually rolled back: <reason>'
  WHERE migration_name = '<name>' AND finished_at IS NULL;
```

**Always document the reason** in the `logs` column.

---

## 6. Common Supabase / Postgres Gotchas

### `auth.uid()` in migrations

RLS policies reference `auth.uid()` which is a Supabase auth function. This
function is not available during `prisma migrate deploy` (which runs as the
database owner, not as a Supabase user). This is fine — `CREATE POLICY`
defines the policy; it does not evaluate `auth.uid()` at creation time.

### Extension permissions

Some extensions (`uuid-ossp`, `pgcrypto`) need to be enabled by the database
owner. On Supabase, most common extensions are pre-enabled. If a migration
uses `CREATE EXTENSION IF NOT EXISTS`, ensure the connected role has
permission.

### Connection pooling (PgBouncer)

Supabase uses PgBouncer by default on port 6543. Prisma migrations **must**
use the direct connection (port 5432), not the pooled connection. This is
configured via `directUrl` in `schema.prisma`.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // pooled (for app runtime)
  directUrl = env("DIRECT_URL")        // direct (for migrations)
}
```

If `DIRECT_URL` is not set, `DATABASE_URL` is used for both. Ensure it points
to port 5432, not 6543.

### DDL in transactions

Postgres executes DDL inside transactions. If a migration fails partway,
**some statements may have committed** (e.g., `CREATE TABLE`) while later
statements did not. This is why idempotent DDL (`IF NOT EXISTS`,
`DROP ... IF EXISTS`) is critical.

### RLS on `_prisma_migrations`

Never enable RLS on `_prisma_migrations`. Prisma needs unrestricted access to
this table for migration tracking.

---

## 7. Production Recovery Checklist

When recovering from a failed migration in production:

- [ ] Run `./scripts/check-migration-state.sh` to capture the current state
- [ ] Identify which migration failed and at what point
- [ ] Compare DB reality to expected state (tables, functions, triggers, RLS)
- [ ] Choose `--applied` or `--rolled-back` based on comparison
- [ ] Run `npx prisma migrate resolve --applied|--rolled-back <name>`
- [ ] Run `npx prisma migrate deploy` to apply remaining migrations
- [ ] Run `npx prisma migrate status` to confirm healthy state
- [ ] Run `./scripts/check-migration-state.sh` again to verify all objects
- [ ] Run `./scripts/smoke-test.sh` to verify application functionality
- [ ] Document what happened and what was done in the deployment log

---

## 8. Exact Commands for Current Failed Migration

The `20260307000002_enterprise_hardening` migration failed because it
referenced `pickup_events` before that table was created. The migration SQL
has since been fixed to `CREATE TABLE IF NOT EXISTS`.

### If the DB already has all the tables from this migration:

```bash
npx prisma migrate resolve --applied 20260307000002_enterprise_hardening
npx prisma migrate deploy
npx prisma migrate status
```

### If the DB is missing some tables from this migration:

```bash
npx prisma migrate resolve --rolled-back 20260307000002_enterprise_hardening
npx prisma migrate deploy
npx prisma migrate status
```

The migration SQL is fully idempotent, so `--rolled-back` + re-deploy is safe
in either case. When in doubt, use `--rolled-back` — it is the safer option
because it re-runs the (now-fixed) migration SQL.
