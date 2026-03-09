# Test Plan — Multi-Tenant Role Architecture

## Status: Post-Launch Migration Plan

---

## 1. Identity Backfill Tests

### Users Table

| Test Case                                           | Expected Result                    |
|---------------------------------------------------- |----------------------------------- |
| Every `parents` row has a corresponding `users` row | Count match, same IDs              |
| `users.email` matches `parents.email`               | 1:1 match                         |
| `users.status` = `active` for all backfilled rows   | No exceptions                     |
| No orphaned `users` rows (not in `parents`)         | Zero orphans                      |

### Center Memberships Table

| Test Case                                                   | Expected Result                |
|------------------------------------------------------------ |------------------------------- |
| Every admin in `parents` has a `center_memberships` row     | Count match                   |
| `center_memberships.role` = `admin` for backfilled admins   | All `admin`                   |
| `center_memberships.membership_status` = `active`           | All `active`                  |
| `center_memberships.center_id` = Dreamwatch center ID       | Single center                 |
| Non-admin parents do NOT have center memberships            | Zero rows                     |

### Child Guardians Table

| Test Case                                                       | Expected Result             |
|---------------------------------------------------------------- |---------------------------- |
| Every `children` row has a `child_guardians` row                | Count match                |
| `child_guardians.user_id` matches `children.parent_id`         | 1:1 FK match               |
| `child_guardians.guardian_role` = `parent`                      | All `parent`               |
| `child_guardians.is_primary_guardian` = `true`                  | All `true`                 |
| `can_book`, `can_view_billing`, `can_manage_pickups` all `true` | All `true`                |

---

## 2. Parent Flow Tests

### Data Access

| Test Case                                                   | Expected Result              |
|------------------------------------------------------------ |----------------------------- |
| Parent can view own children (linked via `child_guardians`) | 200 + correct children       |
| Parent cannot view other parents' children                  | 403 or empty result          |
| Parent with `can_book = false` cannot create reservations   | 403                          |
| Parent with `can_view_billing = false` cannot see billing   | 403 or hidden in UI          |
| Parent with `can_manage_pickups = false` cannot edit pickups| 403                          |

### Guardian Roles

| Test Case                                                   | Expected Result              |
|------------------------------------------------------------ |----------------------------- |
| `parent` guardian can access all enabled features           | Full access per flags        |
| `guardian` has same access model as `parent`                | Access per flags             |
| `emergency_contact` can view child info but not book        | Read-only, `can_book = false`|
| `authorized_pickup_only` has minimal access                 | Pickup verification only     |

### Multi-Child

| Test Case                                                   | Expected Result              |
|------------------------------------------------------------ |----------------------------- |
| Guardian linked to 3 children sees all 3                    | 3 children in dashboard      |
| Guardian linked to child A but not child B                  | Only child A visible         |
| Two guardians linked to same child can both access          | Both see the child           |

---

## 3. Admin/Staff Flow Tests

### Role-Based Route Access

| Route              | `owner` | `admin` | `manager` | `staff` | `billing_only` | `viewer` | No membership |
|------------------- |-------- |-------- |---------- |-------- |--------------- |--------- |-------------- |
| `/admin/settings`  | ✅      | ✅      | ❌        | ❌      | ❌             | ❌       | ❌ redirect    |
| `/admin/closures`  | ✅      | ✅      | ✅        | ❌      | ❌             | ❌       | ❌ redirect    |
| `/admin/tonight`   | ✅      | ✅      | ✅        | ✅      | ❌             | ❌       | ❌ redirect    |
| `/admin/ops`       | ✅      | ✅      | ✅        | ✅      | ❌             | ❌       | ❌ redirect    |
| `/admin/safety`    | ✅      | ✅      | ✅        | ✅      | ❌             | ❌       | ❌ redirect    |
| `/admin/revenue`   | ✅      | ✅      | ✅        | ❌      | ✅             | ❌       | ❌ redirect    |
| `/admin/health`    | ✅      | ✅      | ✅        | ❌      | ❌             | ❌       | ❌ redirect    |

### Membership Status

| Test Case                                                  | Expected Result           |
|----------------------------------------------------------- |-------------------------- |
| Active membership → access granted                         | 200                       |
| Suspended membership → access denied                       | 403 redirect              |
| Revoked membership → access denied                         | 403 redirect              |
| No membership at center → access denied                    | 403 redirect              |

### API Route Access

| Test Case                                                  | Expected Result           |
|----------------------------------------------------------- |-------------------------- |
| `owner` can PUT `/api/admin/settings`                      | 200                       |
| `staff` cannot PUT `/api/admin/settings`                   | 403                       |
| `billing_only` can GET `/api/admin/revenue`                | 200                       |
| `billing_only` cannot POST `/api/admin/closures`           | 403                       |
| `staff` can POST `/api/admin/attendance/check-in`          | 200                       |

---

## 4. Multi-Center Tests

| Test Case                                                        | Expected Result           |
|----------------------------------------------------------------- |-------------------------- |
| Admin at Center A cannot access Center B admin routes             | 403                       |
| User is admin at A and staff at B — correct permissions at each   | Role-specific access      |
| User is parent at A and admin at B — both interfaces accessible   | Dual access               |
| Switching center context updates available routes                 | UI reflects new role      |

---

## 5. Dual-Role User Tests

| Test Case                                                        | Expected Result              |
|----------------------------------------------------------------- |----------------------------- |
| User is both parent and admin — can access `/dashboard`           | 200                          |
| User is both parent and admin — can access `/admin`               | 200                          |
| Parent-only user cannot access `/admin`                           | Redirect to `/dashboard`     |
| Staff-only user (no children) sees empty parent dashboard         | Empty state or redirect      |

---

## 6. Edge Case Tests

| Test Case                                                   | Expected Result              |
|------------------------------------------------------------ |----------------------------- |
| User with no `center_memberships` and no `child_guardians`  | Redirect to onboarding       |
| Deleted child → guardian row cascade-deleted                 | No orphan guardian rows       |
| Deleted user → all memberships and guardians cascade-deleted | Clean cascade                |
| Concurrent role changes don't cause race conditions          | Consistent state             |

---

## 7. Regression Tests (Launch Behavior Preserved)

These tests verify that migration does NOT break existing behavior:

| Test Case                                                   | Expected Result              |
|------------------------------------------------------------ |----------------------------- |
| Existing admin can still access all admin pages              | No change in access          |
| Existing parent can still see their children                 | No change in data            |
| Existing parent can still book reservations                  | No change in flow            |
| Existing parent can still view billing                       | No change in data            |
| Login/logout flow unchanged                                 | No auth regressions          |
| Onboarding flow unchanged                                   | No flow regressions          |

---

## Test Automation

Tests should be implemented as:

1. **Unit tests** for auth helpers (`role-helpers.ts`)
2. **Integration tests** for API routes with mocked memberships/guardians
3. **Database tests** for backfill verification queries
4. **E2E tests** for critical role-gated flows (admin settings, parent booking)
