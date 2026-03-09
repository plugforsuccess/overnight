# Migration & Cutover Checklist — Multi-Tenant Role Architecture

## Status: Post-Launch Migration Plan

---

## Phase A — Create Tables (Non-Breaking)

### Database

- [ ] Create `users` table with all columns, constraints, and indexes
- [ ] Create `center_memberships` table with unique constraint on `(user_id, center_id)`
- [ ] Create `child_guardians` table with unique constraint on `(child_id, user_id)`
- [ ] Add index on `center_memberships(center_id, role)`
- [ ] Add index on `child_guardians(user_id)`
- [ ] Verify all FK constraints reference correct parent tables with `ON DELETE CASCADE`
- [ ] Run migration in staging environment
- [ ] Verify no impact on existing queries or app behavior

### Application

- [ ] Update Prisma schema with new models
- [ ] Generate Prisma client
- [ ] Verify existing code compiles without changes
- [ ] Deploy to staging — confirm zero regressions

---

## Phase B — Backfill Data

### Users Backfill

- [ ] Create `users` rows from all `parents` rows
- [ ] Map: `parents.id` → `users.id`, `parents.email` → `users.email`, etc.
- [ ] Set `users.status = 'active'` for all backfilled rows
- [ ] Verify row count: `SELECT COUNT(*) FROM users` = `SELECT COUNT(*) FROM parents`
- [ ] Verify no duplicate emails

### Center Memberships Backfill

- [ ] Identify the Dreamwatch Overnight center ID
- [ ] Create `center_memberships` for every `parents` row where `role = 'admin'` OR `is_admin = true`
- [ ] Set `role = 'admin'`, `membership_status = 'active'`
- [ ] Verify membership count matches admin count

### Child Guardians Backfill

- [ ] Create `child_guardians` rows from `children` table (using `parent_id` → `user_id`)
- [ ] Set `guardian_role = 'parent'`
- [ ] Set `is_primary_guardian = true` (single-parent model in launch)
- [ ] Set `can_book = true`, `can_view_billing = true`, `can_manage_pickups = true`
- [ ] Verify guardian count matches children count (1:1 in current model)

### Validation

- [ ] Run backfill verification queries (see `scripts/migrations/verify-backfill.ts`)
- [ ] Check for orphaned records
- [ ] Check for constraint violations
- [ ] Log and review any anomalies

---

## Phase C — Parallel Auth Checks

### Deploy Parallel Helpers

- [ ] Deploy `role-helpers.ts` with new auth functions
- [ ] Add parallel checks in admin layout: run both old and new auth, log mismatches
- [ ] Add parallel checks in `checkAdmin()`: compare `parents.role` vs `center_memberships.role`
- [ ] Add parallel checks in parent data access: compare `children.parent_id` vs `child_guardians`
- [ ] Monitor logs for 1-2 weeks with zero mismatches before proceeding

### Validation Criteria

- [ ] Zero mismatches on admin access checks for 7+ days
- [ ] Zero mismatches on parent data access checks for 7+ days
- [ ] No new users created without corresponding entries in all three tables
- [ ] New user registration creates `users` + `child_guardians` entries (dual-write)

---

## Phase D — Cutover

### Route Protection Switchover

- [ ] Switch `/admin/layout.tsx` to use `requireCenterRole()` instead of `parents.role` check
- [ ] Switch `checkAdmin()` to use `center_memberships` lookup
- [ ] Switch all parent data access to use `child_guardians` for ownership verification
- [ ] Update API routes to use new role helpers
- [ ] Deploy to staging, run full regression suite
- [ ] Deploy to production with feature flag (if available)

### Cleanup

- [ ] Remove parallel auth logging code
- [ ] Mark `parents.role` as deprecated in schema comments
- [ ] Mark `parents.is_admin` as deprecated in schema comments
- [ ] Update `handle_new_user()` trigger to also insert into `users` table
- [ ] Update RLS policies to reference new tables
- [ ] Update documentation

### Post-Cutover Monitoring

- [ ] Monitor error rates for 48 hours
- [ ] Verify admin access works for all current admins
- [ ] Verify parent access works for all current parents
- [ ] Check audit logs for any unauthorized access attempts
- [ ] Confirm no 403/401 errors from role check failures

---

## Rollback Plan

If issues are discovered after cutover:

1. Revert route protection to `parents.role` checks (1 commit revert)
2. Keep new tables in place — they are additive and don't break anything
3. Investigate mismatches using audit logs
4. Re-attempt cutover after fixing root cause

---

## Sign-Off

| Phase   | Completed By | Date | Notes |
|-------- |------------- |----- |------ |
| Phase A |              |      |       |
| Phase B |              |      |       |
| Phase C |              |      |       |
| Phase D |              |      |       |
