# Route Access Matrix — Future Multi-Tenant Roles

## Status: Post-Launch Migration Plan

This document maps every route/API to the required role(s) under the future
center-scoped permission model.

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

1. All admin routes must accept `centerId` (from session context or URL parameter)
2. `center_memberships.membership_status` must be `active` for access to be granted
3. Role checks should use the `requireCenterRole()` helper
4. Parent routes should use the `requireGuardianAccess()` helper
5. Audit logs should capture both `user_id` and the `center_id` context
