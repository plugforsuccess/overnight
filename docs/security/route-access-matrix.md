# Route Access Matrix — Multi-Tenant Roles

## Status: LIVE (Phase B Activated)

This document maps every route/API to the required role(s) under the
center-scoped permission model. **This is the live production auth model.**

---

## Role Definitions

| Role           | Scope   | Description                                      |
|--------------- |-------- |------------------------------------------------- |
| `owner`        | center  | Center owner / super-admin                       |
| `admin`        | center  | Full operational access                          |
| `manager`      | center  | Broad ops, limited system settings               |
| `staff`        | center  | Attendance / roster / child ops                  |
| `billing_only` | center  | Billing / revenue only                           |
| `viewer`       | center  | Read-only reporting                              |
| `parent`       | child   | Via `child_guardians` — parent role              |
| `guardian`     | child   | Via `child_guardians` — guardian role             |

---

## Parent-Facing Routes

Access source: `child_guardians` (guardian must be linked to relevant child)

| Route                        | Access                                    | Permission Flags        |
|----------------------------- |------------------------------------------ |------------------------ |
| `/dashboard`                 | Any linked guardian                       | —                       |
| `/dashboard/reservations`    | Guardian with `can_book = true`           | `can_book`              |
| `/dashboard/children`        | Any linked guardian                       | —                       |
| `/dashboard/children/[id]`   | Guardian linked to that child             | —                       |
| `/dashboard/billing`         | Guardian with `can_view_billing = true`   | `can_view_billing`      |
| `/dashboard/profile`         | Authenticated user                        | —                       |
| Booking flows                | Guardian with `can_book = true`           | `can_book`              |
| Pickup management            | Guardian with `can_manage_pickups = true` | `can_manage_pickups`    |

---

## Admin/Staff-Facing Routes

Access source: `center_memberships` (user must have active membership at the center)

### Full Admin Routes

These require elevated operational access.

| Route                   | Allowed Roles                    |
|------------------------ |--------------------------------- |
| `/admin/settings`       | `owner`, `admin`                 |
| `/admin/closures`       | `owner`, `admin`, `manager`      |
| `/admin/health`         | `owner`, `admin`, `manager`      |
| `/api/admin/*` (destructive) | `owner`, `admin`            |

### Staff-Safe Routes

Operational views safe for staff-level access.

| Route                          | Allowed Roles                              |
|------------------------------- |------------------------------------------- |
| `/admin/tonight`               | `owner`, `admin`, `manager`, `staff`       |
| `/admin/ops`                   | `owner`, `admin`, `manager`, `staff`       |
| `/admin/waitlist-ops`          | `owner`, `admin`, `manager`, `staff`       |
| `/admin/capacity`              | `owner`, `admin`, `manager`, `staff`       |
| `/admin/safety`                | `owner`, `admin`, `manager`, `staff`       |
| `/admin/incidents`             | `owner`, `admin`, `manager`, `staff`       |
| Attendance actions             | `owner`, `admin`, `manager`, `staff`       |
| Roster views                   | `owner`, `admin`, `manager`, `staff`       |

### Billing Routes

Financial data access.

| Route                   | Allowed Roles                              |
|------------------------ |------------------------------------------- |
| `/admin/revenue`        | `owner`, `admin`, `billing_only`, `manager`|

### Read-Only Routes

Reporting and dashboards without mutation capability.

| Route                   | Allowed Roles                                        |
|------------------------ |----------------------------------------------------- |
| `/admin/reports` (future) | `owner`, `admin`, `manager`, `billing_only`, `viewer` |

---

## API Route Matrix

| API Endpoint                        | Method | Allowed Roles                        |
|------------------------------------ |------- |------------------------------------- |
| `/api/admin/settings`               | GET    | `owner`, `admin`                     |
| `/api/admin/settings`               | PUT    | `owner`, `admin`                     |
| `/api/admin/closures`               | POST   | `owner`, `admin`, `manager`          |
| `/api/admin/closures`               | DELETE | `owner`, `admin`                     |
| `/api/admin/waitlist-promote`       | POST   | `owner`, `admin`, `manager`, `staff` |
| `/api/admin/attendance/*`           | POST   | `owner`, `admin`, `manager`, `staff` |
| `/api/admin/incidents`              | POST   | `owner`, `admin`, `manager`, `staff` |
| `/api/admin/revenue/*`              | GET    | `owner`, `admin`, `billing_only`     |
| `/api/admin/roster/*`               | GET    | `owner`, `admin`, `manager`, `staff` |
| `/api/admin/capacity/*`             | PUT    | `owner`, `admin`, `manager`          |

---

## Dual-Role Users

A user who is both a parent (via `child_guardians`) and staff (via `center_memberships`)
should have access to both parent and admin interfaces. The UI should provide a
role switcher or detect context from the current route prefix (`/dashboard` vs `/admin`).

---

## Implementation Notes

1. Active center is resolved via `getActiveCenterId()` (single-center deployment)
2. `center_memberships.membership_status` must be `active` for access to be granted
3. Admin routes use `checkAdmin()` / `checkStaff()` / `checkBilling()` from `admin-auth.ts`
4. Parent routes use `verifyGuardianAccess()` from `api-auth.ts` with `parent_id` fallback
5. Admin layout provides `AdminRoleProvider` context for client-side role checks
6. Sidebar filters nav items by role via `useAdminRole()` hook
7. Login redirect: any center membership role redirects to `/admin`, otherwise `/dashboard`

## Canonical Auth Sources (Phase B)

| Concern | Source | Table |
|---------|--------|-------|
| Identity | `users` | `public.users` |
| Staff/Admin access | `center_memberships` | `public.center_memberships` |
| Parent/Guardian access | `child_guardians` | `public.child_guardians` |
| Profile/Billing data | `parents` | `public.parents` (retained for compatibility) |
