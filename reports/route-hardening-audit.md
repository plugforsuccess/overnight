# Route Hardening Audit Report

Generated: 2026-03-09T03:00:50.659Z

## Summary

| Metric | Count |
|--------|-------|
| Total routes scanned | 70 |
| Total findings | 15 |
| Critical | 0 |
| Warning | 13 |
| Info | 2 |

## Route Inventory

| Route Type | Count |
|------------|-------|
| public_page | 5 |
| admin_page | 16 |
| admin_api | 17 |
| parent_api | 20 |
| public_api | 4 |
| parent_page | 8 |

## Findings by Issue Type

| Issue Type | Count |
|------------|-------|
| missing_center_scoping | 6 |
| inline_admin_auth | 2 |
| sensitive_field_exposure | 2 |
| missing_audit_logging | 4 |
| missing_ownership_validation | 1 |

## Critical Findings

None — all critical checks passed.

## Warning Findings

### `/api/admin/attendance/check-in`
- **File:** `src/app/api/admin/attendance/check-in/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** missing_center_scoping
- **Summary:** Admin route operates on center-scoped data but no center/program scoping detected.
- **Evidence:**
  - No center_id, program_id, or programId reference found
- **Recommended Fix:** Add center_id/program_id scoping when multi-center support is needed.

---

### `/api/admin/attendance/check-out`
- **File:** `src/app/api/admin/attendance/check-out/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** missing_center_scoping
- **Summary:** Admin route operates on center-scoped data but no center/program scoping detected.
- **Evidence:**
  - No center_id, program_id, or programId reference found
- **Recommended Fix:** Add center_id/program_id scoping when multi-center support is needed.

---

### `/api/admin/attendance/correct`
- **File:** `src/app/api/admin/attendance/correct/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** missing_center_scoping
- **Summary:** Admin route operates on center-scoped data but no center/program scoping detected.
- **Evidence:**
  - No center_id, program_id, or programId reference found
- **Recommended Fix:** Add center_id/program_id scoping when multi-center support is needed.

---

### `/api/admin/attendance/no-show`
- **File:** `src/app/api/admin/attendance/no-show/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** missing_center_scoping
- **Summary:** Admin route operates on center-scoped data but no center/program scoping detected.
- **Evidence:**
  - No center_id, program_id, or programId reference found
- **Recommended Fix:** Add center_id/program_id scoping when multi-center support is needed.

---

### `/api/admin/attendance/tonight`
- **File:** `src/app/api/admin/attendance/tonight/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** missing_center_scoping
- **Summary:** Admin route operates on center-scoped data but no center/program scoping detected.
- **Evidence:**
  - No center_id, program_id, or programId reference found
- **Recommended Fix:** Add center_id/program_id scoping when multi-center support is needed.

---

### `/api/admin/pickup-verification`
- **File:** `src/app/api/admin/pickup-verification/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** inline_admin_auth
- **Summary:** Admin API uses inline auth check instead of shared checkAdmin() helper.
- **Evidence:**
  - Inline role/is_admin verification found
  - checkAdmin() import not detected
- **Recommended Fix:** Refactor to use the shared checkAdmin() helper from @/lib/admin-auth for consistency.

---

### `/api/admin/waitlist-promote`
- **File:** `src/app/api/admin/waitlist-promote/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** inline_admin_auth
- **Summary:** Admin API uses inline auth check instead of shared checkAdmin() helper.
- **Evidence:**
  - Inline role/is_admin verification found
  - checkAdmin() import not detected
- **Recommended Fix:** Refactor to use the shared checkAdmin() helper from @/lib/admin-auth for consistency.

---

### `/api/admin/waitlist-promote`
- **File:** `src/app/api/admin/waitlist-promote/route.ts`
- **Route Type:** admin_api
- **Severity:** WARNING
- **Issue:** missing_center_scoping
- **Summary:** Admin route operates on center-scoped data but no center/program scoping detected.
- **Evidence:**
  - No center_id, program_id, or programId reference found
- **Recommended Fix:** Add center_id/program_id scoping when multi-center support is needed.

---

### `/api/children`
- **File:** `src/app/api/children/route.ts`
- **Route Type:** parent_api
- **Severity:** WARNING
- **Issue:** missing_audit_logging
- **Summary:** Mutation route has no detectable audit/event logging.
- **Evidence:**
  - HTTP methods with mutations: POST, DELETE
  - No logAuditEvent, audit_log, or event table insert found
- **Recommended Fix:** Consider adding audit logging for important mutations.

---

### `/api/children/[id]/medical-profile`
- **File:** `src/app/api/children/[id]/medical-profile/route.ts`
- **Route Type:** parent_api
- **Severity:** WARNING
- **Issue:** missing_audit_logging
- **Summary:** Mutation route has no detectable audit/event logging.
- **Evidence:**
  - HTTP methods with mutations: POST
  - No logAuditEvent, audit_log, or event table insert found
- **Recommended Fix:** Consider adding audit logging for important mutations.

---

### `/api/onboarding-status`
- **File:** `src/app/api/onboarding-status/route.ts`
- **Route Type:** parent_api
- **Severity:** WARNING
- **Issue:** missing_audit_logging
- **Summary:** Mutation route has no detectable audit/event logging.
- **Evidence:**
  - HTTP methods with mutations: PATCH
  - No logAuditEvent, audit_log, or event table insert found
- **Recommended Fix:** Consider adding audit logging for important mutations.

---

### `/api/stripe`
- **File:** `src/app/api/stripe/route.ts`
- **Route Type:** parent_api
- **Severity:** WARNING
- **Issue:** missing_audit_logging
- **Summary:** Mutation route has no detectable audit/event logging.
- **Evidence:**
  - HTTP methods with mutations: POST
  - No logAuditEvent, audit_log, or event table insert found
- **Recommended Fix:** Consider adding audit logging for important mutations.

---

### `/dashboard/reservations/[blockId]`
- **File:** `src/app/dashboard/reservations/[blockId]/page.tsx`
- **Route Type:** parent_page
- **Severity:** WARNING
- **Issue:** missing_ownership_validation
- **Summary:** Dynamic parent page with no detectable ownership check (may be handled by API).
- **Evidence:**
  - Dynamic segments: [blockId]
  - No ownership pattern detected in page component
- **Recommended Fix:** Verify that the underlying API enforces ownership validation.


## Info Findings

### `/api/admin/pickup-verification`
- **File:** `src/app/api/admin/pickup-verification/route.ts`
- **Route Type:** admin_api
- **Severity:** INFO
- **Issue:** sensitive_field_exposure
- **Summary:** Possible sensitive field exposure detected (likely false positive — field appears used for validation/verification, not in API response).
- **Evidence:**
  - Pattern matched: select\s*\([^)]*pin_hash
- **Recommended Fix:** Verify sensitive fields are not included in API responses. Use .select() to exclude them.

---

### `/api/settings`
- **File:** `src/app/api/settings/route.ts`
- **Route Type:** parent_api
- **Severity:** INFO
- **Issue:** sensitive_field_exposure
- **Summary:** Possible sensitive field exposure detected (likely false positive — field appears used for validation/verification, not in API response).
- **Evidence:**
  - Pattern matched: ['"]password['"]
- **Recommended Fix:** Verify sensitive fields are not included in API responses. Use .select() to exclude them.


## All Routes

| Route | Type | File | Dynamic | Methods |
|-------|------|------|---------|---------|
| `/` | public_page | src/app/page.tsx | - | - |
| `/admin` | admin_page | src/app/admin/page.tsx | - | - |
| `/admin` | admin_page | src/app/admin/layout.tsx | - | - |
| `/admin/capacity` | admin_page | src/app/admin/capacity/page.tsx | - | - |
| `/admin/closures` | admin_page | src/app/admin/closures/page.tsx | - | - |
| `/admin/health` | admin_page | src/app/admin/health/page.tsx | - | - |
| `/admin/incidents` | admin_page | src/app/admin/incidents/page.tsx | - | - |
| `/admin/ops` | admin_page | src/app/admin/ops/page.tsx | - | - |
| `/admin/pickup-verification` | admin_page | src/app/admin/pickup-verification/page.tsx | - | - |
| `/admin/plans` | admin_page | src/app/admin/plans/page.tsx | - | - |
| `/admin/revenue` | admin_page | src/app/admin/revenue/page.tsx | - | - |
| `/admin/roster` | admin_page | src/app/admin/roster/page.tsx | - | - |
| `/admin/safety` | admin_page | src/app/admin/safety/page.tsx | - | - |
| `/admin/settings` | admin_page | src/app/admin/settings/page.tsx | - | - |
| `/admin/tonight` | admin_page | src/app/admin/tonight/page.tsx | - | - |
| `/admin/waitlist` | admin_page | src/app/admin/waitlist/page.tsx | - | - |
| `/admin/waitlist-ops` | admin_page | src/app/admin/waitlist-ops/page.tsx | - | - |
| `/api/admin` | admin_api | src/app/api/admin/route.ts | - | GET, PUT |
| `/api/admin/attendance/check-in` | admin_api | src/app/api/admin/attendance/check-in/route.ts | - | POST |
| `/api/admin/attendance/check-out` | admin_api | src/app/api/admin/attendance/check-out/route.ts | - | POST |
| `/api/admin/attendance/correct` | admin_api | src/app/api/admin/attendance/correct/route.ts | - | POST |
| `/api/admin/attendance/no-show` | admin_api | src/app/api/admin/attendance/no-show/route.ts | - | POST |
| `/api/admin/attendance/tonight` | admin_api | src/app/api/admin/attendance/tonight/route.ts | - | GET |
| `/api/admin/closures` | admin_api | src/app/api/admin/closures/route.ts | - | GET, POST |
| `/api/admin/health/bootstrap` | admin_api | src/app/api/admin/health/bootstrap/route.ts | - | GET |
| `/api/admin/health/issues` | admin_api | src/app/api/admin/health/issues/route.ts | - | GET, POST |
| `/api/admin/health/run` | admin_api | src/app/api/admin/health/run/route.ts | - | POST |
| `/api/admin/health/runs` | admin_api | src/app/api/admin/health/runs/route.ts | - | GET |
| `/api/admin/incidents` | admin_api | src/app/api/admin/incidents/route.ts | - | GET |
| `/api/admin/ops-metrics` | admin_api | src/app/api/admin/ops-metrics/route.ts | - | GET |
| `/api/admin/pickup-verification` | admin_api | src/app/api/admin/pickup-verification/route.ts | - | GET, POST |
| `/api/admin/revenue` | admin_api | src/app/api/admin/revenue/route.ts | - | GET |
| `/api/admin/safety` | admin_api | src/app/api/admin/safety/route.ts | - | GET |
| `/api/admin/waitlist-promote` | admin_api | src/app/api/admin/waitlist-promote/route.ts | - | POST |
| `/api/attendance/[id]/pickup-verification` | parent_api | src/app/api/attendance/[id]/pickup-verification/route.ts | [id] | GET, POST |
| `/api/auth/me` | public_api | src/app/api/auth/me/route.ts | - | POST |
| `/api/auth/signup` | public_api | src/app/api/auth/signup/route.ts | - | POST |
| `/api/authorized-pickups/[id]` | public_api | src/app/api/authorized-pickups/[id]/route.ts | [id] | PATCH, DELETE |
| `/api/bookings` | parent_api | src/app/api/bookings/route.ts | - | GET, POST, PATCH, DELETE |
| `/api/capacity` | parent_api | src/app/api/capacity/route.ts | - | GET |
| `/api/children` | parent_api | src/app/api/children/route.ts | - | GET, POST, PUT, DELETE |
| `/api/children/[id]/allergies` | parent_api | src/app/api/children/[id]/allergies/route.ts | [id] | POST |
| `/api/children/[id]/attendance` | parent_api | src/app/api/children/[id]/attendance/route.ts | [id] | GET, POST, PATCH |
| `/api/children/[id]/authorized-pickups` | parent_api | src/app/api/children/[id]/authorized-pickups/route.ts | [id] | GET, POST |
| `/api/children/[id]/details` | parent_api | src/app/api/children/[id]/details/route.ts | [id] | GET |
| `/api/children/[id]/emergency-contacts` | parent_api | src/app/api/children/[id]/emergency-contacts/route.ts | [id] | GET, POST |
| `/api/children/[id]/events` | parent_api | src/app/api/children/[id]/events/route.ts | [id] | GET, POST |
| `/api/children/[id]/incidents` | parent_api | src/app/api/children/[id]/incidents/route.ts | [id] | GET, POST |
| `/api/children/[id]/medical-profile` | parent_api | src/app/api/children/[id]/medical-profile/route.ts | [id] | GET, POST |
| `/api/dashboard` | parent_api | src/app/api/dashboard/route.ts | - | GET |
| `/api/emergency-contacts/[id]` | parent_api | src/app/api/emergency-contacts/[id]/route.ts | [id] | PATCH, DELETE |
| `/api/onboarding-status` | parent_api | src/app/api/onboarding-status/route.ts | - | GET, PATCH |
| `/api/reservations` | parent_api | src/app/api/reservations/route.ts | - | GET, DELETE |
| `/api/reservations/[id]/events` | parent_api | src/app/api/reservations/[id]/events/route.ts | [id] | GET |
| `/api/reservations/detail` | parent_api | src/app/api/reservations/detail/route.ts | - | GET, PATCH |
| `/api/settings` | parent_api | src/app/api/settings/route.ts | - | GET, PATCH |
| `/api/stripe` | parent_api | src/app/api/stripe/route.ts | - | POST |
| `/api/stripe/webhook` | public_api | src/app/api/stripe/webhook/route.ts | - | POST |
| `/dashboard` | parent_page | src/app/dashboard/page.tsx | - | - |
| `/dashboard` | parent_page | src/app/dashboard/layout.tsx | - | - |
| `/dashboard/children` | parent_page | src/app/dashboard/children/page.tsx | - | - |
| `/dashboard/payments` | parent_page | src/app/dashboard/payments/page.tsx | - | - |
| `/dashboard/reservations` | parent_page | src/app/dashboard/reservations/page.tsx | - | - |
| `/dashboard/reservations/[blockId]` | parent_page | src/app/dashboard/reservations/[blockId]/page.tsx | [blockId] | - |
| `/dashboard/settings` | parent_page | src/app/dashboard/settings/page.tsx | - | - |
| `/login` | public_page | src/app/login/page.tsx | - | - |
| `/policies` | public_page | src/app/policies/page.tsx | - | - |
| `/pricing` | public_page | src/app/pricing/page.tsx | - | - |
| `/schedule` | parent_page | src/app/schedule/page.tsx | - | - |
| `/signup` | public_page | src/app/signup/page.tsx | - | - |

## Known Limitations

- Static heuristics can miss indirect helper-based auth (e.g., auth in called utility functions)
- Ownership may be enforced in called functions, not directly in the scanned file
- False positives are acceptable and labeled where detected
- Center/tenant scoping warnings reflect single-center deployment — not active vulnerabilities
- This script is a safety net, not a replacement for code review

## Methodology

This report was generated by `scripts/audit-route-hardening.ts`, a static heuristic scanner that:

1. Discovers all `page.tsx`, `layout.tsx`, and `route.ts` files under `src/app/`
2. Derives URL paths from filesystem paths
3. Classifies routes by type (public, parent, admin)
4. Applies regex-based heuristic checks for auth, ownership, audit logging, sensitive fields, and namespace correctness
5. Compares route prefixes against middleware PROTECTED_ROUTES
