# Phase B Cutover Notes — Role Architecture Activation

**Date**: 2026-03-09
**Status**: Activated

---

## What Changed

Phase B switches the Overnight platform from legacy `parents.role` auth to the
center-scoped multi-tenant role architecture.

### Canonical Auth Sources

| Before (Phase A) | After (Phase B) |
|-------------------|-----------------|
| `parents.role` for admin access | `center_memberships.role` for admin access |
| `parents.is_admin` flag | Active membership at center |
| `children.parent_id` for child access | `child_guardians` for child access |
| `parents` as identity root | `users` as identity root |

### Launch Roles

| Role | Access |
|------|--------|
| `owner` | Full center access, highest authority |
| `admin` | Full operational access |
| `staff` | Attendance, safety, incidents, ops, pickup PIN |
| `billing_only` | Revenue only |
| `parent` | Guardian-linked child access only |

---

## Files Modified

### Core Auth Layer
- `src/lib/role-helpers.ts` — Added `getActiveCenterId()`, `getGuardianChildIds()`
- `src/lib/admin-auth.ts` — Replaced `parents.role` check with `center_memberships`
- `src/lib/api-auth.ts` — Identity via `users` table, added `verifyGuardianAccess()`, `getAccessibleChildIds()`
- `src/lib/admin-role-context.tsx` — New React context for role-based client components

### Admin Layer
- `src/app/admin/layout.tsx` — Uses `center_memberships` via `requireCenterRole()`, provides `AdminRoleProvider`
- `src/components/admin-sidebar.tsx` — Filters nav items by role
- All 11 admin page files — Use `useAdminRole()` for client-side role checks

### Admin API Routes
- `src/app/api/admin/pickup-verification/route.ts` — Uses `checkStaff()` instead of inline auth
- `src/app/api/admin/waitlist-promote/route.ts` — Uses `checkAdmin()` instead of inline auth
- All other admin API routes — Already use `checkAdmin()` which now uses center_memberships

### Parent API Routes
- `src/app/api/children/route.ts` — Guardian-based access with parent_id fallback
- `src/app/api/children/[id]/*` — All child sub-routes use `verifyGuardianAccess()`
- `src/app/api/reservations/route.ts` — Uses `getAccessibleChildIds()` for child filtering
- `src/app/api/reservations/detail/route.ts` — Guardian-based access for booking details
- `src/app/api/dashboard/route.ts` — Children fetched via guardian links
- Other parent routes — Updated with guardian-based fallback pattern

### Navigation & Login
- `src/components/navbar.tsx` — Admin check via `center_memberships`
- `src/app/login/page.tsx` — Any center role redirects to `/admin`
- `src/app/api/auth/me/route.ts` — Returns role from `center_memberships`

### New Files
- `src/lib/admin-role-context.tsx` — AdminRoleProvider + useAdminRole hook
- `scripts/seed-launch-accounts.ts` — Seed script for launch role accounts
- `docs/security/phase-b-cutover-notes.md` — This document

---

## Backward Compatibility

### Preserved
- `parents` table remains in schema (profile/billing data)
- `children.parent_id` FK remains (DB schema compatibility)
- All guardian checks include `parent_id` fallback for non-backfilled users
- `authenticateRequest()` checks `users` table first, falls back to `parents`
- `parentId` alias maintained in `AuthResult` interface

### Deprecated
- `parents.role` — No longer used for auth decisions
- `parents.is_admin` — No longer checked anywhere
- Direct `parent_id` ownership checks — Replaced by guardian-based access

---

## Migration Path for Existing Data

1. Run `backfill-role-tables.ts` to populate `users`, `center_memberships`, `child_guardians`
2. Run `verify-backfill.ts` to validate parity
3. Optionally run `seed-launch-accounts.ts` for test role accounts
4. Deploy Phase B code

The fallback logic ensures existing users work even before backfill completes.

---

## Testing Checklist

- [ ] Owner can access all admin routes
- [ ] Admin can access all admin routes
- [ ] Staff can only access: tonight, safety, incidents, ops, pickup PIN
- [ ] Billing can only access: revenue
- [ ] Parent can access dashboard and child-linked resources
- [ ] Non-member is redirected from admin to dashboard
- [ ] Guardian can only access linked children
- [ ] New child creation auto-creates guardian link
- [ ] Existing parent_id users still work (fallback)
- [ ] Route audit passes
- [ ] Smoke test passes
