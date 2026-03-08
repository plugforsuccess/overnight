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
| Schema NOT applied, metadata failed | `npx prisma migrate resolve --rolled-back <name>` then `deploy` |
| Metadata drift (marked applied, schema missing) | See [Scenario D](#scenario-d-metadata-drift) |
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
applied to the actual database. This decides which recovery strategy to use.

### Check tables

```bash
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
npx prisma migrate resolve --applied <migration_name>
npx prisma migrate deploy
npx prisma migrate status
```

### Scenario B: Schema is NOT fully present (partial failure)

The migration failed partway through — some tables/columns exist, others
don't. The migration itself is marked **failed** (not applied).

```bash
# Mark as rolled back so Prisma will re-run it
npx prisma migrate resolve --rolled-back <migration_name>

# Re-apply (works because our migrations use idempotent DDL)
npx prisma migrate deploy
npx prisma migrate status
```

### Scenario C: Migration needs to be rewritten

The migration SQL itself is wrong (references non-existent tables, syntax
errors, etc.):

```bash
# 1. Roll back the failed migration metadata
npx prisma migrate resolve --rolled-back <migration_name>

# 2. Fix the migration SQL file in prisma/migrations/<name>/migration.sql
# 3. Re-deploy
npx prisma migrate deploy
npx prisma migrate status
```

### Scenario D: Metadata drift

**This is the most dangerous scenario.** A migration is marked as **applied**
in `_prisma_migrations` but its schema objects (tables, functions, triggers)
do not actually exist in the database. This causes downstream migrations to
fail because they reference tables they expect to exist.

**Why `--rolled-back` alone doesn't fix this:** `prisma migrate resolve
--rolled-back` adds a new "rolled back" row but does **not** remove the
existing "applied" row. Prisma sees the "applied" row and skips re-running
the migration.

**Recovery requires deleting the stale row** (this is the documented
exception to the "avoid direct edits" rule):

```bash
# 1. Confirm the migration is truly drifted (marked applied, tables missing)
./scripts/check-migration-state.sh

# 2. Delete the stale "applied" row so Prisma will re-run it
psql $DATABASE_URL -c "
  DELETE FROM _prisma_migrations
  WHERE migration_name = '<drifted_migration_name>'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL;
"

# 3. Also resolve any downstream failed migration
npx prisma migrate resolve --rolled-back <failed_downstream_migration>

# 4. Redeploy — Prisma will re-run the drifted migration + downstream
npx prisma migrate deploy
npx prisma migrate status
```

**Example — the `center_staff_memberships` failure:**

`000004_sprint_hardening` failed because `000003_operational_hardening` was
marked as applied but `center_staff_memberships` didn't exist:

```bash
# Delete stale 000003 row
psql $DATABASE_URL -c "
  DELETE FROM _prisma_migrations
  WHERE migration_name = '20260307000003_operational_hardening'
    AND finished_at IS NOT NULL AND rolled_back_at IS NULL;
"

# Resolve failed 000004
npx prisma migrate resolve --rolled-back 20260307000004_sprint_hardening

# Redeploy both
npx prisma migrate deploy
npx prisma migrate status
```

### Scenario E: Migration dependency drift (000003 → 000004 pattern)

A downstream migration fails not because of its own SQL, but because an
**upstream migration's objects are missing** despite being marked APPLIED.

**Symptoms:**

- Migration `000004_sprint_hardening` fails with:
  `ERROR: relation "public.center_staff_memberships" does not exist`
- `_prisma_migrations` shows `000003_operational_hardening` as **APPLIED**
- But querying `information_schema.tables` reveals the 000003 tables are absent
- The failure is a dependency issue, not a SQL syntax issue

**Why `--rolled-back` alone is insufficient:**

Running `npx prisma migrate resolve --rolled-back 000003` does **not** remove
the existing APPLIED row. It inserts a second row with `rolled_back_at` set.
Prisma's migration engine sees the APPLIED row first and concludes 000003 has
already run — it will never re-execute the SQL.

```
Before --rolled-back:
  000003 | APPLIED      ← Prisma trusts this, skips re-run

After --rolled-back:
  000003 | APPLIED      ← Still here — Prisma still skips
  000003 | ROLLED_BACK  ← New row, but APPLIED row takes precedence
```

**When to delete the stale row:**

Delete the APPLIED row when **all three** conditions are true:

1. `_prisma_migrations` shows the migration as APPLIED (`finished_at` set,
   `rolled_back_at` NULL)
2. The migration's schema objects do not exist in the database
3. `./scripts/check-migration-state.sh` reports DRIFT for that migration

**Full recovery sequence:**

```bash
# 1. Diagnose — confirm drift exists
npm run migrate:check

# 2. Delete the stale APPLIED row for the drifted upstream migration
psql $DATABASE_URL -c "
  DELETE FROM _prisma_migrations
  WHERE migration_name = '20260307000003_operational_hardening'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL;
"

# 3. Resolve the downstream failed migration
npx prisma migrate resolve --rolled-back 20260307000004_sprint_hardening

# 4. Redeploy — Prisma re-runs 000003 (now missing from metadata) then 000004
npx prisma migrate deploy

# 5. Verify everything is healthy
npm run migrate:check
```

**How to prevent this from recurring:**

- Always run `npm run migrate:check` before `prisma migrate deploy` (see the
  Pre-Flight Checklist in ARCHITECTURE.md)
- The CI workflow (`.github/workflows/migration-ci.yml`) applies all migrations
  from scratch on every PR to catch dependency ordering issues early
- Migration `000004` now documents its exact dependencies in its header comment

---

## 4. When to Use `--applied` vs `--rolled-back` vs Row Deletion

| Scenario | Metadata | Schema | Action |
|----------|----------|--------|--------|
| Timeout / hook failure | Failed | Fully present | `--applied` |
| SQL error partway | Failed | Partially present | `--rolled-back` + deploy |
| SQL wrong, needs fix | Failed | Partially present | `--rolled-back` + fix SQL + deploy |
| Metadata drift | Applied | Missing | Delete row + deploy |
| Dependency drift (E) | Upstream: Applied, Downstream: Failed | Upstream objects missing | Delete upstream row + `--rolled-back` downstream + deploy |
| Schema present, metadata missing | No row | Fully present | `--applied` |

---

## 5. When Manual SQL Is Appropriate

Direct SQL against `_prisma_migrations` is required for:

- **Metadata drift** (Scenario D above) — `--rolled-back` does not remove
  the stale "applied" row
- **Prisma CLI unavailable** — resolve via SQL instead
- **Batch recovery** — multiple migrations need simultaneous repair

If you must use raw SQL:

```sql
-- Delete a stale "applied" row for a drifted migration
DELETE FROM _prisma_migrations
  WHERE migration_name = '<name>'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL;

-- Mark a failed migration as applied
UPDATE _prisma_migrations
  SET finished_at = now(), rolled_back_at = NULL,
      logs = 'Manually resolved: <reason>'
  WHERE migration_name = '<name>' AND finished_at IS NULL;
```

**Always document the reason** in the `logs` column or in commit messages.

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

## 7. Migration Dependency Chain

Our migrations have explicit ordering dependencies:

```
0_baseline
  └→ 20260306000002_create_parent_settings
  └→ 20260307000001_harden_parent_onboarding (needs set_updated_at())
       └→ 20260307000002_enterprise_hardening (creates update_timestamp(),
            child_events, child_attendance_sessions, pickup_events)
            └→ 20260307000003_operational_hardening (creates reservation_events,
                 incident_reports, center_staff_memberships, pickup_verifications,
                 enforce_attendance_transition())
                 └→ 20260307000004_sprint_hardening (creates idempotency_keys,
                      adds archived_at columns, enforce_incident_transition(),
                      prevent_hard_delete())
```

If a migration fails, **always check whether its predecessors truly applied**
by verifying their schema objects exist. Use `./scripts/check-migration-state.sh`
to detect metadata drift.

---

## 8. Production Recovery Checklist

When recovering from a failed migration in production:

- [ ] Run `./scripts/check-migration-state.sh` to capture the current state
- [ ] Identify which migration failed and at what point
- [ ] Compare DB reality to expected state (tables, functions, triggers, RLS)
- [ ] Check whether predecessor migrations have metadata drift
- [ ] If metadata drift detected: delete the stale row (Scenario D)
- [ ] If failed migration: choose `--applied` or `--rolled-back`
- [ ] Run recovery commands
- [ ] Run `npx prisma migrate deploy` to apply remaining migrations
- [ ] Run `npx prisma migrate status` to confirm healthy state
- [ ] Run `./scripts/check-migration-state.sh` again to verify all objects
- [ ] Run `./scripts/smoke-test.sh` to verify application functionality
- [ ] Document what happened and what was done in the deployment log
