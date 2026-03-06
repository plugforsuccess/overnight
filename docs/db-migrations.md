# Database Migrations

## Overview

Schema changes use **Prisma** for new migrations and **Knex** for legacy
migrations. The application connects to **Postgres** (Supabase in production,
local Postgres in development).

> **`src/db/schema.ts` is deprecated.** It contains only TypeScript type
> definitions. Never add DDL there — create a new migration instead.

## Schema Ownership

**Source of truth:** `prisma/schema.prisma` is the canonical schema definition.

| Tool | Role | Status |
|------|------|--------|
| **Prisma** | Schema definition, type generation, new migrations | **Active** — use for all new schema changes |
| **Knex** | Legacy migrations (pre-existing, already applied) | **Legacy** — do not create new Knex migrations |
| **SQL (in Prisma migrations)** | RLS policies, triggers, functions | **Active** — Prisma cannot manage these; embed in migration SQL |

### For new schema changes

1. Add/modify models in `prisma/schema.prisma`
2. Create a migration in `prisma/migrations/<timestamp>_<name>/migration.sql`
3. Include RLS policies and triggers in the same migration SQL
4. Run `npx prisma migrate deploy` against the target database
5. Run `npx prisma generate` to update the TypeScript client

### Keeping Prisma and DB in sync

The Prisma schema was originally introspected from the live database. Legacy
Knex migrations in `src/db/migrations/` remain applied but should not be
modified. New tables and columns go through Prisma migrations only.

To verify sync: run `npx prisma db pull` and diff against `schema.prisma`.

## Running Migrations

```bash
# Apply all pending Prisma migrations
npx prisma migrate deploy

# Generate Prisma client after schema changes
npx prisma generate

# Legacy: apply Knex migrations (only if needed for pre-existing migrations)
npx knex migrate:latest
```

## Creating a New Migration

```bash
# With a running database:
npx prisma migrate dev --name <descriptive_name>

# Without a database (manual):
# 1. Edit prisma/schema.prisma
# 2. Create prisma/migrations/<timestamp>_<name>/migration.sql
# 3. Write the SQL DDL + RLS policies
# 4. Apply with: npx prisma migrate deploy
```

## Migration Files

### Prisma Migrations (`prisma/migrations/`)

| Directory | Description |
|-----------|-------------|
| `20260306000002_create_parent_settings/` | Parent notification, safety, and household preference settings with RLS policies. |

### Legacy Knex Migrations (`src/db/migrations/`)

| File | Description |
|------|-------------|
| `20260305000001_initial_schema.js` | Core tables: parents, children, plans, overnight_blocks, reservations, nightly_capacity, waitlist, credits, audit_log, config. |
| `20260305000002_add_constraints_and_billing_events.js` | CHECK constraints, partial unique index, billing_events table. |
| `20260305000003_add_auth_user_id_to_parents.js` | Adds auth_user_id column (superseded by fix_parent_uid_mismatch). |
| `20260305000004_create_stripe_prices.js` | Creates stripe_prices cache table. |
| `20260305000004_create_subscriptions_and_pending_plan_changes.js` | Subscriptions and pending plan changes. |
| `20260305000005_children_hardening.js` | Child allergies, emergency contacts, authorized pickups with enums. |
| `20260305000006_make_legacy_name_nullable.sql` | Makes legacy name columns nullable. |
| `20260305000007_enable_rls_core_tables.sql` | Initial RLS policies (superseded). |
| `20260306000001_fix_parent_uid_mismatch.sql` | Canonical identity fix: parents.id = auth.users.id, rewrites all RLS. |

## Database Tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `parents` | Parent/admin user accounts | `id = auth.uid()` |
| `children` | Child profiles (belongs to parent) | `parent_id = auth.uid()` |
| `plans` | Subscription tier catalog (3/4/5 nights) | Read-only for authenticated |
| `overnight_blocks` | Weekly enrollment with pricing snapshot | `parent_id = auth.uid()` |
| `reservations` | Individual night-level bookings | Via `overnight_blocks.parent_id` |
| `nightly_capacity` | Per-night capacity tracking and status | Read-only for authenticated |
| `waitlist` | FIFO waitlist with timed offers | `parent_id = auth.uid()` |
| `credits` | Credit ledger for canceled nights | `parent_id = auth.uid()` |
| `audit_log` | Admin action audit trail | Service-role only |
| `config` | Key-value app configuration | Service-role only |
| `billing_events` | Stripe webhook idempotency log | Service-role only |
| `subscriptions` | Stripe subscription tracking | `parent_id = auth.uid()` |
| `pending_plan_changes` | Queued plan tier changes | Via `subscriptions` |
| `parent_settings` | Per-parent notification, safety, and household preferences | `parent_id = auth.uid()` |
| `notifications` | Parent-facing notifications and alerts | `parent_id = auth.uid()` |
| `child_allergies` | Allergy records per child | Via `children.parent_id` |
| `child_allergy_action_plans` | Treatment plans for allergies | Via `child_allergies → children` |
| `child_emergency_contacts` | Emergency contacts (max 2 per child) | Via `children.parent_id` |
| `child_authorized_pickups` | Authorized pickup persons with PIN | Via `children.parent_id` |
| `pickup_events` | Pickup verification audit trail | Via `children.parent_id` |
| `stripe_prices` | Stripe price ID cache | Service-role only |

## Connection Configuration

Set one of these environment variables:

| Variable | Description |
|----------|-------------|
| `SUPABASE_DB_URL` | Supabase Postgres connection string (preferred) |
| `DATABASE_URL` | Generic Postgres connection string |

If neither is set, the app falls back to `localhost:5432/overnight_dev` for
local development.

In production (`NODE_ENV=production`), SSL is enabled automatically for
Supabase compatibility.

## Constraints & Safety

- **CHECK constraints** on all status/enum columns (blocks, reservations,
  nightly_capacity, waitlist, credits, parents role, plans nights)
- **Partial unique index** on `reservations(child_id, date)` excluding
  canceled rows — prevents double-booking at the DB level
- **Foreign keys** with appropriate CASCADE/SET NULL behavior
- **Advisory locks** + `FOR UPDATE` used at the application layer for
  concurrency-safe capacity enforcement
- **RLS policies** on all parent-facing tables — see table above

## Best Practices

1. **Never modify an existing migration** that has been applied in production.
   Create a new migration instead.
2. **Use Prisma for all new schema changes.** Do not create new Knex migrations.
3. **Include RLS policies** in the migration SQL for any new table that stores
   parent or child data.
4. **Test migrations** against a fresh database before deploying.
5. **Seed data** belongs in migrations (for config/plans) or separate seed
   files — never in application bootstrap code.
