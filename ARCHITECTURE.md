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

## Legacy Code (Not Active)

The following code exists but is NOT used by the active Next.js application:

| Path | Type | Status |
|---|---|---|
| `src/server.js` | Express server | Not started by any npm script |
| `src/routes/billing.ts` | Express billing routes | Legacy, not used by `/schedule` |
| `src/routes/reservations.js` | Express reservation routes | Legacy |
| `src/routes/jobs.js` | Express job routes | Legacy |
| `src/billing/subscription-service.ts` | Knex-based subscription management | Legacy |
| `src/billing/webhooks.ts` | Express webhook handler | Legacy (Next.js handler is active) |
| `src/services/*.js` | Knex-based business logic | Legacy |
| `src/middleware/auth.js` | Express auth middleware | Legacy |
| `src/middleware/audit.js` | Express audit middleware | Legacy |
| `src/db/` | Knex connection + migrations | Legacy |
| `knexfile.js` | Knex CLI config | Legacy |
