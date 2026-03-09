# Future Multi-Tenant Role Architecture

## Status: Post-Launch Migration Plan

This document defines the target role architecture for evolving Overnight from a
single-center launch model into a multi-tenant childcare platform with
center-scoped roles, staff/admin separation, and family/contact access patterns.

**Do not implement before single-center launch is stable.**

---

## 1. Current State

### Current Role Model

```
parents.role = 'parent' | 'admin'
parents.is_admin = boolean (legacy)
```

- Single global role on the `parents` table
- No center-scoping
- No distinction between staff/admin operational roles and family relationships
- `center_staff_memberships` exists as infrastructure but is not the live auth source

### Current Limitations

1. Role is global, not center-scoped
2. Role lives on `parents` — semantically wrong for staff identities
3. One user cannot hold multiple roles across centers
4. Future staff roles (`manager`, `billing_only`, `staff`) don't fit `parents.role`
5. Parent-child relationship and operational access are conflated

---

## 2. Target Architecture

### Layer 1 — Canonical Identity (`users`)

A person, independent of their role or center.

| Column       | Type      | Notes                           |
|------------- |---------- |-------------------------------- |
| `id`         | uuid PK   | Aligned to `auth.users.id`      |
| `email`      | text       | Unique                          |
| `first_name` | text       |                                 |
| `last_name`  | text       |                                 |
| `phone`      | text       |                                 |
| `status`     | text       | `active` / `suspended` / `deactivated` |
| `created_at` | timestamptz |                                |
| `updated_at` | timestamptz |                                |

### Layer 2 — Center-Scoped Access (`center_memberships`)

Operational permissions per center.

| Column              | Type      | Notes                          |
|-------------------- |---------- |------------------------------- |
| `id`                | uuid PK   |                                |
| `user_id`           | uuid FK    | → `users.id`                   |
| `center_id`         | uuid FK    | → `centers.id`                 |
| `role`              | text       | See role definitions below     |
| `membership_status` | text       | `active` / `suspended` / `revoked` |
| `invited_by_user_id`| uuid       | Nullable, for audit trail      |
| `created_at`        | timestamptz |                               |
| `updated_at`        | timestamptz |                               |

**Unique constraint**: `(user_id, center_id)`

**Allowed roles (v1 multi-tenant)**:

| Role           | Description                                      |
|--------------- |------------------------------------------------- |
| `owner`        | Center owner / super-admin within that center    |
| `admin`        | Full operational access                          |
| `manager`      | Broad operations, limited system settings        |
| `staff`        | Attendance / roster / child ops only             |
| `billing_only` | Billing / revenue access without ops power       |
| `viewer`       | Read-only reporting access                       |

### Layer 3 — Family/Contact Relationships (`child_guardians`)

Parent/guardian access to children, separate from operational roles.

| Column                 | Type      | Notes                         |
|----------------------- |---------- |------------------------------ |
| `id`                   | uuid PK   |                               |
| `child_id`             | uuid FK    | → `children.id`               |
| `user_id`              | uuid FK    | → `users.id`                  |
| `relationship_to_child`| text       | e.g., "mother", "uncle"       |
| `guardian_role`        | text       | `parent` / `guardian` / `emergency_contact` / `authorized_pickup_only` |
| `is_primary_guardian`  | boolean    | Default `false`               |
| `can_book`             | boolean    | Default `true`                |
| `can_view_billing`     | boolean    | Default `true`                |
| `can_manage_pickups`   | boolean    | Default `true`                |
| `created_at`           | timestamptz |                              |
| `updated_at`           | timestamptz |                              |

**Unique constraint**: `(child_id, user_id)`

---

## 3. Design Principles (Brightwheel-Inspired)

1. **Staff/admin roles are operational roles** — attached to center membership, not parent profile
2. **Family/contact access is distinct** — modeled through child-linked relationships
3. **A person may hold multiple identities** — parent at Center A, admin at Center B
4. **Permissions scale by center** — center-aware, explicit, queryable, enforceable
5. **Roles are additive and evolvable** — new roles don't require identity table rewrites

---

## 4. Access Model

### Parent App Access

```
auth.user_id → users.id → child_guardians.user_id → child_guardians.child_id
```

Questions answered:
- Is this user linked to this child?
- Can they book / view billing / manage pickups?

### Admin/Staff App Access

```
auth.user_id → users.id → center_memberships.user_id → center_memberships.role
```

Questions answered:
- Does this user belong to this center?
- What is their role? Is their membership active?
- Are they allowed to perform this action?

---

## 5. Route Permission Matrix

See `docs/security/route-access-matrix.md` for the full matrix.

---

## 6. Migration Phases

### Phase A — Create Tables (Non-Breaking)

- Create `users`, `center_memberships`, `child_guardians` tables
- Add indexes and constraints
- No changes to current auth behavior

### Phase B — Backfill Data

- Populate `users` from `parents`
- Create `center_memberships` for current admins
- Create `child_guardians` from current parent-child relationships

### Phase C — Parallel Auth Checks

- Deploy new auth helpers alongside existing ones
- Run dual checks and log mismatches
- Validate all routes produce identical results

### Phase D — Cutover

- Switch route/API enforcement to new model
- Deprecate `parents.role` / `parents.is_admin`
- Remove legacy auth checks

See `docs/security/migration-cutover-checklist.md` for the detailed checklist.

---

## 7. New Auth Helpers

| Helper                                      | Purpose                              |
|-------------------------------------------- |------------------------------------- |
| `getCurrentUserProfile()`                   | Get canonical user from `users`      |
| `getCenterMembership(userId, centerId)`     | Get membership + role for a center   |
| `requireCenterRole(centerId, roles[])`      | Gate: user must hold one of `roles`  |
| `requireGuardianAccess(childId, permission)`| Gate: user must be linked guardian   |
| `checkStaffOrAdminForCenter(centerId)`      | Quick admin/staff membership check   |

See `src/lib/role-helpers.ts` for the implementation.

---

## 8. Testing Requirements

See `docs/security/role-test-plan.md` for the full test plan.

---

## 9. Definition of Done

- [ ] Identity stored canonically in `users`
- [ ] Operational roles stored in `center_memberships`
- [ ] Family relationships stored in `child_guardians`
- [ ] Admin/staff access is center-scoped
- [ ] Parent access is child-linked, not global-role-based
- [ ] Single-center launch behavior preserved during transition
- [ ] Future multi-tenant expansion structurally safe
