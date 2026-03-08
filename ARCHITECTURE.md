# Overnight Platform — System Architecture

> Canonical reference for the Overnight daycare platform. Covers data model, system layers,
> request flows, concurrency controls, and operational architecture.

## Platform Overview

Overnight is a Next.js 14 (App Router) application for licensed overnight childcare centers.
Parents reserve nightly care slots (Sun–Thu, 9 PM – 7 AM), manage child profiles, and track
attendance. Staff manage capacity, process check-ins/outs, handle waitlists, and monitor
system health.

**Stack**: Next.js App Router · Supabase (Postgres + Auth + RLS) · Prisma (schema management) ·
Stripe (billing) · Zod (validation)

---

## Data Architecture

### Layer Model

The data model is organized into five functional layers:

```
┌─────────────────────────────────────────────────────┐
│  IDENTITY LAYER                                     │
│  parents · children · child_medical_profiles        │
│  child_allergies · child_emergency_contacts         │
│  child_authorized_pickups · parent_settings         │
└────────────────┬────────────────────────────────────┘
                 │ parent_id / child_id
┌────────────────▼────────────────────────────────────┐
│  INVENTORY LAYER  (supply of capacity)              │
│  centers · programs · program_capacity              │
│  capacity_overrides · admin_settings                │
│  nightly_capacity (legacy)                          │
└────────────────┬────────────────────────────────────┘
                 │ program_capacity_id
┌────────────────▼────────────────────────────────────┐
│  RESERVATION LAYER  (demand / bookings)             │
│  plans · overnight_blocks · reservations            │
│  reservation_nights · waitlist                      │
│  idempotency_keys                                   │
└────────────────┬────────────────────────────────────┘
                 │ reservation_night_id
┌────────────────▼────────────────────────────────────┐
│  ATTENDANCE LAYER  (operational reality)            │
│  attendance_records · child_attendance_sessions     │
│  pickup_verifications · incident_reports            │
└────────────────┬────────────────────────────────────┘
                 │ event FKs
┌────────────────▼────────────────────────────────────┐
│  EVENT LAYER  (immutable audit trails)              │
│  reservation_events · attendance_events             │
│  capacity_override_events · child_events            │
│  pickup_events · billing_events · audit_log         │
└─────────────────────────────────────────────────────┘
```

### Inventory Layer

**`program_capacity`** is the source of truth for per-night availability:

| Column | Purpose |
|--------|---------|
| `capacity_total` | Maximum beds available (from `admin_settings.max_capacity`) |
| `capacity_reserved` | Counter of confirmed `reservation_nights` (atomically maintained) |
| `capacity_waitlisted` | Counter of waitlisted `reservation_nights` |
| `status` | `open` / `full` / `closed` — derived from counters + overrides |

**`capacity_overrides`** represent operator intent (closures, reductions):
- Partial unique index: one active override per `(program_id, care_date)`
- Types: `closed` (capacity→0), `reduced_capacity` (capacity→N), `reopened`
- Each override emits an immutable `capacity_override_event`

**Effective capacity resolution**: `program_capacity.capacity_total` is mutated directly
when overrides are applied, so booking reads stay simple — no override join needed.

### Reservation Layer

**Booking flow**: Parent → select nights → `POST /api/bookings` → creates `overnight_block` +
`reservations` → calls `atomic_book_nights()` RPC → creates `reservation_nights` + updates
capacity counters.

**`reservation_nights`** status lifecycle:
`pending` → `confirmed` | `waitlisted` → `cancelled` | `completed` | `no_show`

- Unique constraint on `(child_id, care_date)` prevents duplicate bookings
- Links to `program_capacity` for counter management

### Attendance Layer

**`attendance_records`** tracks real-world state of each reserved night:
- 1:1 with `reservation_nights` (unique on `reservation_night_id`)
- Status lifecycle: `expected` → `checked_in` → `checked_out` | `no_show`
- Lazily initialized via `ensureAttendanceRecord()` on first access
- All status transitions use **optimistic locking** (WHERE includes current status)

### Event Layer

All event tables are **append-only** — never update or delete rows.

| Event Table | Tracks |
|-------------|--------|
| `reservation_events` | Booking lifecycle (created, confirmed, cancelled) |
| `attendance_events` | Check-in, check-out, no-show, corrections |
| `capacity_override_events` | Closures, reductions, reopenings |
| `child_events` | Child safety events, pickup verifications |
| `pickup_events` | Every pickup verification for legal record |
| `billing_events` | Stripe webhook processing (idempotent) |
| `audit_log` | General-purpose admin action log |

---

## Concurrency Control

### Atomic Database Functions (PL/pgSQL RPCs)

| RPC | Purpose | Lock Target |
|-----|---------|-------------|
| `atomic_book_nights(reservation_id, child_id, dates[], capacity)` | Book nights atomically | `program_capacity` rows (FOR UPDATE) |
| `atomic_cancel_night(reservation_night_id)` | Cancel and decrement counters | `program_capacity` row (FOR UPDATE) |
| `promote_waitlist(care_date)` | Promote next FIFO waitlist entry | `program_capacity` row (FOR UPDATE) |

### Optimistic Locking (Application Layer)

Attendance status transitions include the current status in the UPDATE WHERE clause:

```sql
UPDATE attendance_records SET attendance_status = 'checked_in'
WHERE id = $1 AND attendance_status = 'expected'
```

Prevents: double check-in, double check-out, no-show/check-in races.

### Unique Constraints as Guards

- `reservation_nights(child_id, care_date)` — no duplicate child bookings
- `attendance_records(reservation_night_id)` — no duplicate attendance records
- `capacity_overrides` partial unique — no duplicate active overrides
- `ensureAttendanceRecord()` handles 23505 (unique violation) by re-reading

---

## Auth & Access Control

### Three-Layer Protection

```
Middleware (all routes)
  └── JWT validation via getUser()
  └── Redirect unauthenticated to /login

Server Layout (nested routes)
  └── dashboard/layout.tsx: verify parent profile exists
  └── admin/layout.tsx: verify admin role or is_admin flag

API Routes (data access)
  └── authenticateRequest(): Bearer token → parentId
  └── checkAdmin(): Bearer token → admin role check
  └── Ownership: WHERE parent_id = auth.parentId
```

### Route Protection Matrix

| Route Pattern | Middleware | Layout | API |
|---|---|---|---|
| Public (`/`, `/pricing`) | Headers only | — | — |
| Auth (`/login`, `/signup`) | Redirect if auth'd | — | — |
| Parent (`/dashboard/*`) | JWT required | Parent profile required | `authenticateRequest()` + ownership |
| Admin (`/admin/*`) | JWT required | Admin role required | `checkAdmin()` |
| Parent API (`/api/children/*`) | — | — | `authenticateRequest()` + `parent_id` filter |
| Admin API (`/api/admin/*`) | — | — | `checkAdmin()` |

---

## Admin Operations

### Tonight Dashboard (`/admin/tonight`)
Real-time attendance. `ensureAttendanceForDate(today)` lazily creates records.
Staff actions: check-in, check-out, mark no-show, correct status.

### Waitlist Queue (`/admin/waitlist-ops`)
FIFO waitlist grouped by date. Promote via `promote_waitlist()` RPC.

### Capacity Planner (`/admin/capacity`)
4-week forward view of utilization: confirmed vs. waitlisted vs. available.

### Closures (`/admin/closures`)
30-day calendar. Preview-before-apply. Close, reduce, or reopen nights.

### System Health (`/admin/health`)
Reconciliation engine: `checkCapacity()` + `checkAttendance()` + `checkWaitlist()`.
Issues are persisted with severity and resolvable via admin UI.

---

## Request Flow Examples

### Parent Books a Night

```
POST /api/bookings
  ├── authenticateRequest() → verify JWT, get parentId
  ├── Validate: idempotency key, child ownership, profile completeness
  ├── Create overnight_block + reservation
  ├── Call atomic_book_nights() RPC
  │     ├── SELECT ... FOR UPDATE on program_capacity
  │     ├── IF available → INSERT reservation_night (confirmed), INCREMENT reserved
  │     └── ELSE → INSERT reservation_night (waitlisted), INCREMENT waitlisted
  ├── Insert reservation_events
  └── Return { block, nights: { confirmed, waitlisted } }
```

### Staff Checks In a Child

```
POST /api/admin/attendance/check-in
  ├── checkAdmin()
  ├── ensureAttendanceRecord(nightId) → create if not exists (idempotent)
  ├── UPDATE SET status='checked_in' WHERE status='expected' ← optimistic lock
  ├── Insert attendance_event (child_checked_in)
  └── Return updated record
```

### Admin Closes a Night

```
POST /api/admin/closures { action: 'apply' }
  ├── checkAdmin()
  ├── For each date:
  │     ├── Deactivate existing active override + emit deactivation event
  │     ├── Insert new capacity_override (is_active=true)
  │     ├── Update program_capacity (capacity_total=0, status='closed')
  │     └── Emit capacity_override_applied event
  └── Return { overrides, events }
```

---

## Health Monitoring

```
runHealthChecks()
  ├── checkCapacity()    → counter drift, over-capacity, closed+open conflicts
  ├── checkAttendance()  → missing records, invalid states, child mismatches
  └── checkWaitlist()    → entries on closed nights, stale waitlist
```

Each run creates a `health_check_runs` record. Issues persisted to `health_issues`
with severity (critical/warning/info). Resolvable via admin health dashboard.

---

## Schema Authority

**Prisma is the canonical schema source of truth.**

| Layer | Owner | Location |
|---|---|---|
| Application schema (tables, columns, FKs, indexes) | Prisma | `prisma/schema.prisma` |
| Migrations | Prisma | `prisma/migrations/` |
| RLS policies, triggers, functions, enums, CHECK constraints | SQL | `supabase/rls-policies.sql` |
| Reference snapshot | SQL | `supabase-schema.sql` (read-only reference) |

### Commands

```bash
npm run migrate          # Deploy migrations to production (prisma migrate deploy)
npm run migrate:dev      # Create new migration during development (prisma migrate dev)
npm run migrate:status   # Check migration status
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma validate      # Validate schema syntax
```

### Knex (DEPRECATED)

Knex migrations in `src/db/migrations/` are legacy and no longer the schema authority.
The Knex runtime is only used by the Express billing services (`src/billing/`, `src/routes/`),
which are themselves legacy code not invoked by the active Next.js application.

```bash
npm run migrate:knex:legacy    # Only for legacy compatibility (DO NOT use for new changes)
```

---

## Canonical Payment/Booking Flow

The `/schedule` page uses the **Next.js API routes** exclusively:

```
/schedule (React client)
  │
  ├─ Step 1: Choose plan (3/4/5 nights)
  ├─ Step 2: Select specific nights
  ├─ Step 3: Select child (profile completeness check)
  └─ Step 4: Confirm & Pay
       │
       ├── POST /api/bookings
       │     Creates overnight_block + reservations
       │     Validates: auth, child ownership, profile completeness, capacity
       │
       └── POST /api/stripe
             Creates Stripe Checkout Session
             Redirects to Stripe hosted checkout
                   │
                   └── POST /api/stripe/webhook
                         checkout.session.completed → update overnight_block + confirm reservations
                         invoice.paid → record payment
                         invoice.payment_failed → mark failed
                         customer.subscription.deleted → cancel block
```

### NOT used by `/schedule`:

- `src/routes/billing.ts` (Express, legacy)
- `src/billing/subscription-service.ts` (Express, legacy)
- `src/billing/webhooks.ts` (Express, legacy)

---

## Identity Model

```
auth.users.id = parents.id  (1:1, set by handle_new_user() trigger)
```

- No separate `auth_user_id` column (removed in migration 9)
- Parents table PK is the Supabase Auth user ID directly
- FK: `parents.id → auth.users(id) ON DELETE CASCADE` (maintained in SQL)

---

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx              Root layout (Navbar + Footer)
│   ├── page.tsx                Landing page (public)
│   ├── login/ signup/          Auth pages
│   ├── pricing/ policies/      Public pages
│   ├── schedule/               Booking flow (parent)
│   ├── dashboard/
│   │   ├── layout.tsx          Server-side parent auth gate
│   │   ├── page.tsx            Parent dashboard
│   │   ├── children/           Child profile management
│   │   ├── reservations/       Reservation list + [blockId] detail
│   │   ├── payments/           Payment history
│   │   └── settings/           Profile & preferences
│   ├── admin/
│   │   ├── layout.tsx          Server-side admin auth gate + sidebar
│   │   ├── page.tsx            Admin dashboard
│   │   ├── tonight/            Real-time attendance
│   │   ├── waitlist-ops/       Waitlist queue management
│   │   ├── capacity/           4-week capacity planner
│   │   ├── closures/           Closure & override management
│   │   ├── health/             System health dashboard
│   │   ├── roster/             Weekly roster view
│   │   ├── plans/              Plan management
│   │   ├── waitlist/           Waitlist family management
│   │   ├── pickup-verification/ Pickup PIN verification
│   │   └── settings/           System settings
│   └── api/
│       ├── auth/               Login + signup endpoints
│       ├── admin/              All admin-only APIs (checkAdmin)
│       │   ├── attendance/     Check-in, check-out, no-show, correct, tonight
│       │   ├── closures/       Override CRUD
│       │   ├── health/         Health run, issues, run history
│       │   ├── waitlist-promote/ Waitlist promotion
│       │   └── pickup-verification/
│       ├── children/           Child CRUD + sub-resources
│       ├── bookings/           Booking CRUD + atomic RPCs
│       ├── reservations/       Reservation queries + events
│       ├── stripe/             Stripe + webhooks
│       └── ...                 Settings, capacity, onboarding
├── components/
│   ├── navbar.tsx              Role-aware top navigation
│   ├── footer.tsx              Public footer
│   └── admin-sidebar.tsx       Admin sidebar navigation
├── lib/
│   ├── api-auth.ts             authenticateRequest() + helpers
│   ├── admin-auth.ts           checkAdmin()
│   ├── supabase-*.ts           Client variants (browser, server, SSR, middleware)
│   ├── attendance/             Check-in, check-out, no-show, correct, ensure
│   ├── closures/               Preview, apply, reopen, list
│   ├── health/                 Check-capacity, check-attendance, check-waitlist, run
│   ├── rate-limit.ts           Token bucket rate limiter
│   ├── idempotency.ts          Idempotency key handling
│   └── pin-hash.ts             Pickup PIN hashing (bcrypt)
└── middleware.ts               Route protection + security headers

tests/chaos/                    Concurrency & race condition tests
```

---

## Tables (30+ total)

### Core Domain
| Table | Purpose |
|---|---|
| `parents` | Parent profiles (PK = auth user ID) |
| `children` | Child profiles (FK → parents) |
| `plans` | Plan catalog (3/4/5 nights with prices) |
| `overnight_blocks` | Per-user weekly booking records |
| `reservations` | Individual night bookings (FK → overnight_blocks) |
| `nightly_capacity` | Per-night capacity state |
| `waitlist` | Night-level waitlist entries |

### Child Safety
| Table | Purpose |
|---|---|
| `child_emergency_contacts` | Emergency contacts (max 2 per child) |
| `child_authorized_pickups` | Authorized pickup persons |
| `child_allergies` | Allergy records with enum types |
| `child_allergy_action_plans` | Treatment plans per allergy |

### Billing & Payments
| Table | Purpose |
|---|---|
| `payments` | Payment records from Stripe |
| `subscriptions` | Stripe subscription records (legacy Express system) |
| `pending_plan_changes` | Queued mid-cycle plan changes (legacy) |
| `billing_events` | Webhook idempotency (legacy Express system) |
| `stripe_prices` | Stripe price ID cache |

### System
| Table | Purpose |
|---|---|
| `admin_settings` | Global admin configuration (single row) |
| `credits` | Account credits for cancellations |
| `audit_log` | Admin action audit trail |
| `config` | Key-value application config |

---

## SQL Artifacts Outside Prisma

These are maintained in `supabase/rls-policies.sql`:

- **37 RLS policies** across 14 tables
- **5 triggers** (4x `set_updated_at`, 1x `enforce_max_two_emergency_contacts`)
- **2 custom functions** (`set_updated_at()`, `enforce_max_two_emergency_contacts()`)
- **3 Postgres enums** (`allergy_type`, `allergy_severity`, `treatment_type`)
- **12 CHECK constraints** (status enums, role validation)
- **2 partial unique indexes** (reservations child+date, subscriptions parent active)
- **1 auth FK** (`parents.id → auth.users.id`)

Apply after Prisma migrations:
```bash
psql $DATABASE_URL < supabase/rls-policies.sql
```

---

## Deployment Runbook

### Initial Prisma Cutover

Run these steps in order on the production/staging environment:

```bash
# 1. Take a DB snapshot BEFORE any changes (rollback safety net)
#    In Supabase Dashboard: Project Settings > Database > Backups > Create backup
#    Or: pg_dump $DATABASE_URL > backup_pre_prisma_cutover.sql

# 2. Baseline the existing DB into Prisma migration history
#    This tells Prisma "the 0_baseline migration is already applied" without
#    re-running the SQL (the tables already exist from Knex).
npx prisma migrate resolve --applied 0_baseline

# 3. Apply any new Prisma migrations (currently none beyond baseline)
npm run migrate

# 4. Apply Supabase security artifacts (RLS, triggers, functions, enums, checks)
psql $DATABASE_URL < supabase/rls-policies.sql

# 5. Verify live DB state
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'name';"
psql $DATABASE_URL -c "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'overnight_blocks' AND column_name = 'plan_id';"
psql $DATABASE_URL -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments');"
psql $DATABASE_URL -c "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_settings');"
psql $DATABASE_URL -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;"
```

### Ongoing Migrations

```bash
# Development: create a new migration after editing prisma/schema.prisma
npm run migrate:dev -- --name describe_the_change

# Production: deploy pending migrations (see Pre-Flight Checklist below)
npm run migrate

# After any schema change: re-apply security artifacts
psql $DATABASE_URL < supabase/rls-policies.sql
```

### Pre-Flight Checklist (mandatory before `prisma migrate deploy`)

**`./scripts/check-migration-state.sh` MUST be run before every production
`prisma migrate deploy`.** This is a non-negotiable gate — deploying without
it risks applying migrations on top of metadata drift, which can silently
corrupt the schema.

```bash
# 1. MANDATORY: Run migration health diagnostic
npm run migrate:check
#    ↳ Must show: ✓ No metadata drift detected
#    ↳ Must show: all required tables, functions, RLS as ✓
#    ↳ If ANY drift or missing objects are detected, STOP and follow
#      docs/prisma-migration-recovery.md before proceeding.

# 2. Deploy pending migrations
npm run migrate

# 3. Post-deploy: verify the new state is healthy
npm run migrate:check

# 4. Re-apply security artifacts if migrations changed schema
psql $DATABASE_URL < supabase/rls-policies.sql
```

**Why this matters:** In the 2026-03-07 incident, `000003_operational_hardening`
was marked as applied in `_prisma_migrations` but its tables were absent
(metadata drift). Deploying `000004` on top of this caused a cascade failure.
The pre-flight check would have caught this before deploy.

### Smoke Test Checklist

After deployment, verify these flows manually or via automated tests:

1. **Auth**: signup → login → dashboard loads → logout
2. **Child onboarding**: add child → add emergency contact → add authorized pickup
3. **Booking**: /schedule → select plan → select nights → select child → Confirm & Pay
4. **Stripe**: checkout session created → redirect works → webhook updates block
5. **Dashboard**: reservations load → payments load → settings persist
6. **Admin**: roster loads → waitlist loads → promotion works
7. **Access control**: parent cannot see another parent's children/reservations

---

## Rollback Strategy

### If Prisma migration fails

Prisma migrations are transactional. A failed migration is automatically rolled back
by Postgres. No manual action needed — fix the migration and re-run.

### If app code has regressions after deploy

1. **Revert the code deploy** (git revert or redeploy previous commit)
2. The DB schema changes from the Prisma baseline are **additive only** (nullable
   columns, new tables). Old code that doesn't reference `payments` or
   `admin_settings` will continue to work against the new schema.
3. No compensating migration is needed for the baseline cutover.

### If a future Prisma migration causes data issues

1. **Take a snapshot before every migration** (step 1 in the runbook above)
2. For destructive schema changes (column drops, type changes):
   - Write a compensating DOWN migration as a new Prisma migration
   - Or restore from the pre-migration snapshot
3. For data corruption:
   - Restore from the snapshot taken before the migration
   - `pg_restore` or Supabase Dashboard > Backups > Restore

### Rollback decision tree

```
Migration failed?
  └─ Yes → Automatic rollback (Postgres transaction). Fix and retry.
  └─ No, but app is broken?
       └─ Is it a code issue? → Revert code deploy. Schema is backward-compatible.
       └─ Is it a data issue? → Restore from pre-migration DB snapshot.
       └─ Is it an RLS issue? → Re-apply previous version of supabase/rls-policies.sql.
```

---

## Legacy Code Boundary

### What is legacy

All code under these paths is part of the **Express server runtime** which is
**not started by any npm script** and is **not part of the active Next.js
application**. It exists in the repo but does not execute in production.

```
src/legacy/                    # (proposed future location)
├── server.js                  # Express entrypoint — never started
├── routes/
│   ├── billing.ts             # @deprecated — /schedule uses /api/bookings + /api/stripe
│   ├── reservations.js        # @deprecated — /schedule uses /api/bookings
│   └── jobs.js                # @deprecated — no active caller
├── services/
│   ├── reservation.js         # Knex-based — replaced by /api/bookings
│   ├── enrollment.js          # Knex-based — replaced by /api/bookings
│   ├── waitlist.js            # Knex-based — replaced by /api/bookings
│   ├── capacity.js            # Knex-based — replaced by /api/bookings
│   ├── credit.js              # Knex-based — replaced by webhook handler
│   ├── config.js              # Knex-based — replaced by admin_settings table
│   ├── admin.js               # Knex-based — replaced by /api/admin
│   ├── jobs.js                # Knex-based — no active caller
│   └── notifications.js       # Knex-based — no active caller
├── billing/
│   ├── subscription-service.ts # Knex-based — /schedule uses /api/stripe
│   ├── webhooks.ts            # Knex-based — /api/stripe/webhook is active
│   ├── plans.ts               # Knex-based — /api/bookings uses DEFAULT_PRICING_TIERS
│   └── stripe-client.ts       # Shared — also used by active code via src/lib/stripe.ts
├── middleware/
│   ├── auth.js                # Express — Next.js uses Supabase auth directly
│   └── audit.js               # Express — Next.js uses src/lib/api-auth.ts
└── db/
    ├── index.js               # Knex singleton — not imported by any Next.js code
    ├── connection.ts           # Knex config — not imported by any Next.js code
    └── migrations/             # Legacy schema migrations — Prisma is now canonical
```

### Verification: no Next.js dependency on legacy code

The following command confirms zero imports from legacy paths in the active app:

```bash
grep -r "from ['\"]@/services\|from ['\"]@/routes\|from ['\"]@/server\|from ['\"]@/middleware/auth\|from ['\"]@/middleware/audit\|from ['\"]@/db" src/app/ --include="*.ts" --include="*.tsx"
# Expected output: (empty — no matches)
```

### Runtime isolation

| Runtime | Entry point | Uses Knex? | Status |
|---|---|---|---|
| Next.js (`next dev` / `next start`) | `src/app/` | **No** | **Active** |
| Express (`node src/server.js`) | `src/server.js` | Yes | **Not started** |

The `knex` and `express` npm packages remain in `dependencies` solely because
the legacy code imports them at the module level. They are never loaded at
runtime by the Next.js application. They can be moved to `devDependencies` or
removed entirely once the legacy code is deleted.

### Planned removal

The legacy Express code can be fully deleted when:
1. All smoke tests pass without it (they already do — it's never started)
2. Team confirms no external process starts `src/server.js`
3. No CI/CD pipeline references Express or Knex migration commands

At that point:
- Delete `src/server.js`, `src/routes/`, `src/services/`, `src/middleware/auth.js`,
  `src/middleware/audit.js`, `src/db/`, `knexfile.js`
- Remove `express`, `express-rate-limit`, `knex`, `pg` from `dependencies`
  (keep `pg` only if Prisma needs it — Prisma uses its own driver)
- Remove `@types/express` from `devDependencies`
- Remove `migrate:knex:legacy` and `migrate:billing:legacy` from `package.json` scripts
