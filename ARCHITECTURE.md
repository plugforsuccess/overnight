# Architecture Reference

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

## Tables (20 total)

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

# Production: deploy pending migrations
npm run migrate

# After any schema change: re-apply security artifacts
psql $DATABASE_URL < supabase/rls-policies.sql
```

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
