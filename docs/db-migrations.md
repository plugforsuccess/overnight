# Database Migrations

## Overview

All database schema changes are managed through **Knex migrations** in
`src/db/migrations/`. The application connects to **Postgres** (Supabase in
production, local Postgres in development).

> **`src/db/schema.ts` is deprecated.** It contains only TypeScript type
> definitions. Never add DDL there — create a new migration instead.

## Running Migrations

```bash
# Apply all pending migrations (uses knexfile.js)
npx knex migrate:latest

# Or via npm script
npm run migrate

# Rollback last batch
npx knex migrate:rollback

# Check migration status
npx knex migrate:status
```

## Creating a New Migration

```bash
npx knex migrate:make <descriptive_name>
# e.g. npx knex migrate:make add_phone_to_children
```

This creates a timestamped file in `src/db/migrations/`. Every migration must
export `up` (apply) and `down` (rollback) functions.

## Migration Files

| File | Description |
|------|-------------|
| `20260305000001_initial_schema.js` | Core tables: parents, children, plans, overnight_blocks, reservations, nightly_capacity, waitlist, credits, audit_log, config. Seeds default config and plan tiers. |
| `20260305000002_add_constraints_and_billing_events.js` | CHECK constraints on all status columns, partial unique index on reservations, billing_events table for Stripe webhook idempotency. |

## Database Tables

| Table | Purpose |
|-------|---------|
| `parents` | Parent/admin user accounts |
| `children` | Child profiles (belongs to parent) |
| `plans` | Subscription tier catalog (3/4/5 nights) |
| `overnight_blocks` | Weekly enrollment with pricing snapshot |
| `reservations` | Individual night-level bookings |
| `nightly_capacity` | Per-night capacity tracking and status |
| `waitlist` | FIFO waitlist with timed offers |
| `credits` | Credit ledger for canceled nights |
| `audit_log` | Admin action audit trail |
| `config` | Key-value app configuration |
| `billing_events` | Stripe webhook idempotency log |

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

The migration adds these database-level safety checks:

- **CHECK constraints** on all status/enum columns (blocks, reservations,
  nightly_capacity, waitlist, credits, parents role, plans nights)
- **Partial unique index** on `reservations(child_id, date)` excluding
  canceled rows — prevents double-booking at the DB level
- **Foreign keys** with appropriate CASCADE/SET NULL behavior
- **Advisory locks** + `FOR UPDATE` used at the application layer for
  concurrency-safe capacity enforcement

## Best Practices

1. **Never modify an existing migration** that has been applied in production.
   Create a new migration instead.
2. **Always provide a `down` function** that reverses the `up` changes.
3. **Test migrations** against a fresh database before deploying:
   ```bash
   npx knex migrate:rollback --all && npx knex migrate:latest
   ```
4. **Seed data** belongs in migrations (for config/plans) or separate seed
   files — never in application bootstrap code.
