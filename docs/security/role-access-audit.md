# Role & Access-Control Audit

**Date:** 2026-03-09
**Scope:** Parent, Staff, Admin role model across schema, auth, middleware, API, UI

---

## 1. Role Source of Truth

### Primary: `parents` table

| Column     | Type        | Default    | Constraint                    |
|------------|-------------|------------|-------------------------------|
| `role`     | VARCHAR(255)| `'parent'` | CHECK `('parent', 'admin')`   |

Admin access is determined by a single canonical check:
```
parent.role === 'admin'
```

> **Note:** The `is_admin` boolean column has been deprecated and removed via
> migration `20260309000001_drop_is_admin_column`. All code now uses `role` only.

### Secondary: `center_staff_memberships` table

| Column      | Type    | Constraint                                          |
|-------------|---------|-----------------------------------------------------|
| `user_id`   | UUID FK | → parents.id                                        |
| `center_id` | UUID FK | → centers.id                                        |
| `role`      | VARCHAR | CHECK `('staff', 'admin', 'center_admin', 'super_admin')` |
| `active`    | BOOLEAN | default true                                        |

This table exists in the schema and has RLS policies, but is **not referenced by any application-level auth check** today. It is infrastructure for future multi-center staff support.

### Not used for roles:
- `auth.users.user_metadata` — stores `{ role: 'parent' }` at signup but is **never read** for authorization decisions
- JWT claims — no custom claims are set; role is always looked up from the `parents` table server-side

---

## 2. Supported Roles Today

| Role   | Status              | Storage                  | Enforced?         |
|--------|---------------------|--------------------------|-------------------|
| parent | Fully implemented   | `parents.role = 'parent'`| Yes (default)     |
| admin  | Fully implemented   | `parents.role = 'admin'` OR `parents.is_admin = true` | Yes (server-side) |
| staff  | Schema only         | `center_staff_memberships.role` | No (not wired to auth) |

**Staff status:** The `center_staff_memberships` table and `CenterStaffMembership` Prisma model exist. The `STAFF_ROLES` constant is defined in `src/types/children.ts`. However, no middleware, auth helper, API route, or layout checks `center_staff_memberships` for access control. Staff is planned infrastructure, not an active role.

---

## 3. Auth Enforcement Layers

### Layer 1: Next.js Edge Middleware (`src/middleware.ts`)
- **Scope:** All non-API, non-static routes
- **Checks:** JWT validity via `supabase.auth.getUser()`
- **Protects:** `/dashboard/*`, `/schedule/*`, `/admin/*`
- **Does NOT check role** — only authentication
- **API routes excluded** from middleware (`/api/` in matcher exclusion)

### Layer 2: Server Layouts (SSR auth gates)

| Layout                          | File                              | Checks                    |
|---------------------------------|-----------------------------------|---------------------------|
| Admin layout                    | `src/app/admin/layout.tsx`        | JWT + `role='admin' \|\| is_admin` |
| Dashboard layout                | `src/app/dashboard/layout.tsx`    | JWT + parent row exists   |

Admin layout redirects non-admins to `/dashboard`. Dashboard layout redirects unauthenticated users to `/login`.

### Layer 3: API Route Auth

**Parent-facing APIs** use `authenticateRequest()` from `src/lib/api-auth.ts`:
- Validates JWT via `supabase.auth.getUser()`
- Verifies parent row exists in `parents` table
- Returns `{ userId, parentId }` — caller must apply ownership filters

**Admin APIs** use `checkAdmin()` from `src/lib/admin-auth.ts`:
- Validates JWT via `supabase.auth.getUser()`
- Verifies `parents.role = 'admin'` OR `parents.is_admin = true`
- Returns user object or null

Two admin routes (`/api/admin/route.ts`, `/api/admin/pickup-verification/route.ts`) define local `checkAdmin()`/`verifyAdmin()` functions with identical logic rather than importing the shared helper.

### Layer 4: RLS Policies (`supabase/rls-policies.sql`)
- Parents can SELECT their own children, reservations, pickups, etc. via `parent_id = auth.uid()`
- Admins have `FOR ALL` policies checking `role = 'admin' OR is_admin`
- **RLS does NOT check `center_staff_memberships`** — staff members have no RLS-level access today
- `center_staff_memberships` itself has RLS: users can SELECT own rows, admins can manage all

### Layer 5: Client-side Navigation (`src/components/navbar.tsx`)
- Fetches `role` and `is_admin` from parent profile
- Shows admin links only when `isAdmin = (profile.role === 'admin' || profile.is_admin)`
- Mobile nav applies same conditional

---

## 4. Role Check Inventory

### Files using `checkAdmin()` (shared helper)

| File | HTTP Methods | Import |
|------|-------------|--------|
| `src/app/api/admin/closures/route.ts` | GET, POST | `@/lib/admin-auth` |
| `src/app/api/admin/attendance/check-in/route.ts` | POST | `@/lib/admin-auth` |
| `src/app/api/admin/attendance/check-out/route.ts` | POST | `@/lib/admin-auth` |
| `src/app/api/admin/attendance/correct/route.ts` | POST | `@/lib/admin-auth` |
| `src/app/api/admin/attendance/no-show/route.ts` | POST | `@/lib/admin-auth` |
| `src/app/api/admin/attendance/tonight/route.ts` | GET | `@/lib/admin-auth` |
| `src/app/api/admin/health/bootstrap/route.ts` | POST | `@/lib/admin-auth` |
| `src/app/api/admin/health/run/route.ts` | POST | `@/lib/admin-auth` |
| `src/app/api/admin/health/runs/route.ts` | GET | `@/lib/admin-auth` |
| `src/app/api/admin/health/issues/route.ts` | GET, PATCH | `@/lib/admin-auth` |
| `src/app/api/admin/incidents/route.ts` | GET | `@/lib/admin-auth` |
| `src/app/api/admin/ops-metrics/route.ts` | GET | `@/lib/admin-auth` |
| `src/app/api/admin/revenue/route.ts` | GET | `@/lib/admin-auth` |
| `src/app/api/admin/safety/route.ts` | GET | `@/lib/admin-auth` |

### Files with local admin check (duplicated logic)

| File | Function | Logic |
|------|----------|-------|
| `src/app/api/admin/route.ts` | `checkAdmin()` | Same as shared — checks `role === 'admin' \|\| is_admin` |
| `src/app/api/admin/pickup-verification/route.ts` | `verifyAdmin()` | Same logic, returns adminId string |
| `src/app/api/admin/waitlist-promote/route.ts` | `verifyAdmin()` | Same logic, returns adminId string |

### Files using `authenticateRequest()` (parent auth)

| File | Ownership Check |
|------|-----------------|
| `src/app/api/children/route.ts` | `parent_id` filter on all queries |
| `src/app/api/children/[id]/details/route.ts` | Verifies child.parent_id = parentId |
| `src/app/api/children/[id]/allergies/route.ts` | Verifies child ownership |
| `src/app/api/children/[id]/medical-profile/route.ts` | Verifies child ownership |
| `src/app/api/children/[id]/emergency-contacts/route.ts` | Verifies child ownership |
| `src/app/api/children/[id]/authorized-pickups/route.ts` | Verifies child ownership |
| `src/app/api/children/[id]/attendance/route.ts` | Verifies child ownership |
| `src/app/api/children/[id]/incidents/route.ts` | Verifies child ownership |
| `src/app/api/children/[id]/events/route.ts` | Verifies child ownership |
| `src/app/api/reservations/route.ts` | Filters by parent's children |
| `src/app/api/reservations/detail/route.ts` | Verifies block.parent_id |
| `src/app/api/reservations/[id]/events/route.ts` | Verifies via child→parent join |
| `src/app/api/authorized-pickups/[id]/route.ts` | Nested join: `children!inner(parent_id)` |
| `src/app/api/emergency-contacts/[id]/route.ts` | Nested join: `children!inner(parent_id)` |
| `src/app/api/attendance/[id]/pickup-verification/route.ts` | Verifies session→child→parent |
| `src/app/api/dashboard/route.ts` | `parent_id` filter on all queries |
| `src/app/api/settings/route.ts` | `parentId` filter |
| `src/app/api/onboarding-status/route.ts` | `parentId` filter |

### Files with custom auth (neither shared helper)

| File | Auth Method | Notes |
|------|-------------|-------|
| `src/app/api/bookings/route.ts` | Manual `getUserClient()` + `resolveParentId()` | Ownership verified but uses different auth pattern |
| `src/app/api/capacity/route.ts` | Manual `getUserClient()` | Returns public capacity data, no ownership filtering (by design) |
| `src/app/api/stripe/route.ts` | Manual `getUserClient()` + `resolveParentId()` | Verifies block ownership before payment |

---

## 5. Access Matrix

### Page Routes

| Route | Parent | Staff | Admin | Enforcement |
|-------|--------|-------|-------|-------------|
| `/dashboard/*` | Yes | — | Yes (not redirected) | Layout SSR: JWT + parent exists |
| `/admin/*` | No | No | Yes | Layout SSR: JWT + `role='admin'` |
| `/schedule` | Yes | — | Yes | Middleware: JWT only |
| `/login`, `/signup` | Unauth only | — | Unauth only | Middleware redirect |
| `/pricing`, `/policies` | Public | Public | Public | No auth |

### Parent-Facing APIs

| API Route | Parent | Staff | Admin | Ownership Check | Enforcement |
|-----------|--------|-------|-------|-----------------|-------------|
| `GET /api/dashboard` | Yes | No | No | `parent_id` filter | `authenticateRequest()` |
| `GET/POST /api/children` | Yes | No | No | `parent_id` filter | `authenticateRequest()` |
| `PUT/DELETE /api/children` | Yes | No | No | `parent_id` filter | `authenticateRequest()` |
| `GET /api/children/[id]/details` | Yes | No | No | child ownership | `authenticateRequest()` |
| `POST /api/children/[id]/allergies` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/POST /api/children/[id]/medical-profile` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/POST /api/children/[id]/emergency-contacts` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/POST /api/children/[id]/authorized-pickups` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/POST/PATCH /api/children/[id]/attendance` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/POST /api/children/[id]/incidents` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/POST /api/children/[id]/events` | Yes | No | No | child ownership | `authenticateRequest()` |
| `GET/DELETE /api/reservations` | Yes | No | No | child→parent filter | `authenticateRequest()` |
| `GET/PATCH /api/reservations/detail` | Yes | No | No | block.parent_id | `authenticateRequest()` |
| `GET /api/reservations/[id]/events` | Yes | No | No | child→parent join | `authenticateRequest()` |
| `PATCH/DELETE /api/authorized-pickups/[id]` | Yes | No | No | nested join | `authenticateRequest()` |
| `PATCH/DELETE /api/emergency-contacts/[id]` | Yes | No | No | nested join | `authenticateRequest()` |
| `GET/POST /api/attendance/[id]/pickup-verification` | Yes | No | No | session→child→parent | `authenticateRequest()` |
| `GET/PATCH /api/settings` | Yes | No | No | `parentId` filter | `authenticateRequest()` |
| `GET/PATCH /api/onboarding-status` | Yes | No | No | `parentId` filter | `authenticateRequest()` |
| `GET/POST/DELETE/PATCH /api/bookings` | Yes | No | No | ownership verified | Custom auth |
| `GET /api/capacity` | Yes | — | — | None (public data) | Custom auth (JWT only) |
| `POST /api/stripe` | Yes | No | No | block ownership | Custom auth |

### Admin APIs

| API Route | Parent | Staff | Admin | Enforcement |
|-----------|--------|-------|-------|-------------|
| `GET/PUT /api/admin` | No | No | Yes | Local `checkAdmin()` |
| `POST /api/admin/attendance/check-in` | No | No | Yes | `checkAdmin()` |
| `POST /api/admin/attendance/check-out` | No | No | Yes | `checkAdmin()` |
| `POST /api/admin/attendance/correct` | No | No | Yes | `checkAdmin()` |
| `POST /api/admin/attendance/no-show` | No | No | Yes | `checkAdmin()` |
| `GET /api/admin/attendance/tonight` | No | No | Yes | `checkAdmin()` |
| `GET/POST /api/admin/closures` | No | No | Yes | `checkAdmin()` |
| `GET/POST /api/admin/health/*` (4 routes) | No | No | Yes | `checkAdmin()` |
| `GET /api/admin/incidents` | No | No | Yes | `checkAdmin()` |
| `GET /api/admin/ops-metrics` | No | No | Yes | `checkAdmin()` |
| `GET/POST /api/admin/pickup-verification` | No | No | Yes | Local `verifyAdmin()` |
| `GET /api/admin/revenue` | No | No | Yes | `checkAdmin()` |
| `GET /api/admin/safety` | No | No | Yes | `checkAdmin()` |
| `POST /api/admin/waitlist-promote` | No | No | Yes | Local `verifyAdmin()` |

### Auth APIs

| API Route | Auth Required | Enforcement |
|-----------|--------------|-------------|
| `POST /api/auth/signup` | No | Rate-limited, validates input |
| `POST /api/auth/me` | Yes (JWT) | Returns role for client redirect |

---

## 6. Gaps and Inconsistencies

### GAP-1: Duplicated admin check logic — RESOLVED
**Files:** `src/app/api/admin/route.ts`, `src/app/api/admin/pickup-verification/route.ts`, `src/app/api/admin/waitlist-promote/route.ts`
**Issue:** These files defined local `checkAdmin()`/`verifyAdmin()` functions instead of importing the shared helper.
**Resolution:** Refactored all three routes to import from `@/lib/admin-auth`.

### GAP-2: Dual admin flag (`role` + `is_admin`) — RESOLVED
**Issue:** Admin status was determined by `role = 'admin' OR is_admin = true`, which could diverge.
**Resolution:** Consolidated to `role = 'admin'` as the single source of truth.
Migration `20260309000001_drop_is_admin_column` backfills any `is_admin=true` rows
to `role='admin'` and drops the `is_admin` column.

### GAP-3: Staff role not enforced (INFO — not a vulnerability)
**Issue:** `center_staff_memberships` table exists with `staff`, `admin`, `center_admin`, `super_admin` roles, but no middleware, auth helper, or API route reads from it.
**Risk:** No security risk today (staff has no elevated access). Risk is that when staff support is added, it may be done inconsistently.
**Recommendation:** When staff access is needed, create a `checkStaffOrAdmin()` helper and update routes incrementally.

### GAP-4: Middleware excludes API routes from auth check (BY DESIGN)
**Issue:** The Next.js middleware matcher excludes `/api/` routes. API routes handle their own auth.
**Risk:** If a new API route is added without calling `authenticateRequest()` or `checkAdmin()`, it's unprotected.
**Recommendation:** Consider a shared API middleware wrapper or lint rule to catch unprotected routes.

### GAP-5: `authenticateRequest()` does not return role — RESOLVED
**Issue:** `authenticateRequest()` returned `{ userId, parentId }` without role info.
**Resolution:** Extended `AuthResult` to include `role` and `isAdmin` fields.

### GAP-6: Custom auth patterns in bookings/capacity/stripe (LOW risk)
**Issue:** These routes use manual auth (`getUserClient()` + `resolveParentId()`) instead of `authenticateRequest()`.
**Risk:** Inconsistent auth patterns. Ownership is still verified correctly.
**Recommendation:** Migrate to `authenticateRequest()` when refactoring.

### GAP-7: RLS policies don't include staff role (FUTURE risk)
**Issue:** All admin RLS policies check `role = 'admin'`. When staff is implemented, RLS will need updating.
**Recommendation:** When adding staff, update RLS to include `center_staff_memberships` checks for appropriate tables.

---

## 7. Object-Level Authorization Summary

### Parent-facing APIs: SECURE
All parent-facing APIs enforce ownership:
- Child operations verify `child.parent_id = parentId`
- Reservation operations verify ownership via parent_id on overnight_blocks
- Pickup/emergency contact operations use nested joins (`children!inner(parent_id)`)
- Settings and onboarding filter by `parentId`

### Admin APIs: SECURE
All admin routes call `checkAdmin()` or equivalent before processing. Admin operations intentionally have system-wide scope.

### RLS: SECURE
Database-level RLS provides defense-in-depth:
- Parents can only SELECT rows linked to their own `auth.uid()`
- Admins have `FOR ALL` access on operational tables
- Append-only tables (events, audit_log) are properly restricted

---

## 8. Navigation Visibility: SECURE

| Component | Admin Links | Staff Links | Parent Links |
|-----------|-------------|-------------|--------------|
| Desktop navbar | `isAdmin` gated | None | Always shown |
| Mobile navbar | `isAdmin` gated | None | Always shown |
| Desktop dropdown | Admin Panel link `isAdmin` gated | None | Dashboard, Settings, Sign Out |
| Admin sidebar | No role check (protected by layout) | None | N/A |

Parents cannot see admin links. Admin sidebar is protected by server-side layout redirect — even direct URL navigation is blocked before render.

---

## 9. Recommendations

### v1 — Minimal hardening — COMPLETED

1. **Consolidated duplicated admin checks** — All admin routes now import from `@/lib/admin-auth`.
2. **Added `checkStaffOrAdmin()` helper** — Forward-looking helper in `src/lib/admin-auth.ts`.
3. **Extended `AuthResult` with role** — `authenticateRequest()` now returns `role` and `isAdmin`.
4. **Added route protection test** — `test/route-auth-audit.test.js` scans for unprotected routes.
5. **Consolidated to single role field** — `is_admin` column dropped; `parents.role` is sole source of truth.

### v2 — Staff support (when needed)

1. **Add `checkStaff()` helper** that reads `center_staff_memberships` for the authenticated user
2. **Update `checkStaffOrAdmin()`** to include staff membership check
3. **Update RLS policies** to grant staff read/write on operational tables (attendance, pickups, incidents)
4. **Add staff navigation** in sidebar (subset of admin routes)
5. **Keep `parents.role` as `'parent' | 'admin'`** — staff role is stored in `center_staff_memberships`, not the parent table

### v3 — Schema refinement (optional, later)

1. **Consider `role` enum migration** — replace VARCHAR CHECK with a Postgres enum for type safety
2. **Evaluate `center_staff_memberships` RLS** — consider per-center data scoping when multi-center is active

---

## 10. Conclusion

The role model is **hardened and consolidated**:
- Single canonical role field: `parents.role` (`'parent' | 'admin'`)
- `is_admin` column removed — no more dual-flag drift risk
- Admin access enforced server-side at multiple layers (middleware, layout, API, RLS)
- Parent ownership consistently verified across all parent-facing APIs
- Staff infrastructure exists in schema but is correctly non-functional (no accidental access)
- Navigation properly hides admin links from non-admin users
- All admin routes use shared `checkAdmin()` helper from `@/lib/admin-auth`
- Automated route protection test catches unprotected API routes
