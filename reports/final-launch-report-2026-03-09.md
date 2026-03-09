# Final Stabilization Go/No-Go Report — Tenancy Merge (2026-03-09)

## Decision
- **NO-GO for production launch from this runner** due unresolved execution-environment gaps for migration rehearsal and end-to-end smoke execution.
- **Recommendation track:** **single-center launch** (once blocked verification steps below are executed and pass in staging/prod-like environment).

## 1) Build status
- ✅ **Code blocker fixed:** `src/app/api/admin/route.ts` `.eq` chaining was corrected by reordering `.select(...).eq(...)` on the children count query.
- ✅ **Build now passes** when required runtime env vars are supplied:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- ✅ Also resolved an additional Next.js pre-render blocker on `/login` by wrapping `useSearchParams()` usage in a Suspense boundary.

## 2) Migration verification status
- ❌ `./scripts/verify-migrations-ci.sh` could not run because neither `DIRECT_URL` nor `DATABASE_URL` is configured in this environment.
- Impact: full staging migration rehearsal is **not validated from this run**.

## 3) Smoke-test status
- ❌ `npm run smoke-test` remains blocked in this environment because `npx tsx` package fetch is denied by registry policy (HTTP 403).
- Additional note: running via `ts-node` currently fails at script startup due to `__dirname` usage in ESM context (`ReferenceError: __dirname is not defined in ES module scope`).
- Impact: required post-migration dynamic smoke suite is **not validated from this run**.

## 4) Bootstrap admin seed confirmation
- ✅ Confirmed migration no longer hardcodes placeholder owner email in bootstrap facility seed.
  - Facility bootstrap now inserts `owner_email = NULL` (not `owner@example.com`).
  - Admin membership seed now derives from real admin users by joining `auth.users` to `public.parents` with admin-role flags.
  - Facility `owner_email` is then backfilled from the earliest real admin user email when available (and only if currently null/empty/placeholder).

## 5) Remaining known issues
1. Migration verification requires real `DIRECT_URL` / `DATABASE_URL` in target environment.
2. Smoke suite requires registry access for `tsx` (or script modernization to ESM-safe path handling and direct `ts-node` compatibility).
3. Launch approval cannot be upgraded to GO until (1) and (2) are executed and passing on staging.

## 6) Explicit launch recommendation
- **Target launch mode:** **single-center launch**.
- **Current status:** **NO-GO until migration verification + smoke suite pass in real environment**.
- **Promotion criteria after rerun:**
  1. `npm run build` passes in CI/release env.
  2. `./scripts/verify-migrations-ci.sh` passes against staging DB with real `DIRECT_URL`/`DATABASE_URL`.
  3. `npm run smoke-test` passes with working registry access + real Supabase credentials.
  4. If all pass: switch to **GO for single-center launch**.
