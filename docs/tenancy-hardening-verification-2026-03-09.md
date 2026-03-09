# Tenancy Hardening Completion Report

## Exact files changed
- `src/app/api/admin/waitlist-promote/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/api/bookings/route.ts`
- `src/app/api/capacity/route.ts`
- `src/app/api/stripe/route.ts`
- `prisma/migrations/202603090001_daycare_tenancy_merge/migration.sql`
- `test/tenancy-isolation-access.test.js`

## Updated route coverage table
| file | entity touched | scope method | role/ownership guard | status |
|---|---|---|---|---|
| src/app/api/admin/attendance/check-in/route.ts | none | n/a | facility/platform admin check | PASS |
| src/app/api/admin/attendance/check-out/route.ts | none | n/a | facility/platform admin check | PASS |
| src/app/api/admin/attendance/correct/route.ts | none | n/a | facility/platform admin check | PASS |
| src/app/api/admin/attendance/no-show/route.ts | none | n/a | facility/platform admin check | PASS |
| src/app/api/admin/attendance/tonight/route.ts | attendance_records | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/closures/route.ts | admin_settings, programs | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/health/bootstrap/route.ts | audit_log, health_check_runs, health_issues | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/health/issues/route.ts | health_issues | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/health/run/route.ts | none | n/a | facility/platform admin check | PASS |
| src/app/api/admin/health/runs/route.ts | health_check_runs | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/incidents/route.ts | attendance_events, capacity_override_events, reservation_events | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/ops-metrics/route.ts | attendance_records, billing_ledger, child_authorized_pickups, child_emergency_contacts, children, program_capacity, reservation_nights | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/pickup-verification/route.ts | audit_log, child_authorized_pickups, children, pickup_events | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/revenue/route.ts | billing_ledger, payments, reservation_nights | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/route.ts | admin_settings, children, payments, plans, reservation_events, reservations, waitlist | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/safety/route.ts | child_allergies, child_attendance_sessions, child_authorized_pickups, child_emergency_contacts, child_medical_profiles, children, reservations | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/admin/waitlist-promote/route.ts | audit_log, promote_waitlist, reservation_nights | facility context + facility_id scoping present | facility/platform admin check | PASS |
| src/app/api/attendance/[id]/pickup-verification/route.ts | child_attendance_sessions, child_events, pickup_verifications | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/auth/me/route.ts | parents | facility context + facility_id scoping present | custom auth | PASS |
| src/app/api/auth/signup/route.ts | parents | facility context + facility_id scoping present | none | PASS |
| src/app/api/authorized-pickups/[id]/route.ts | child_authorized_pickups | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/bookings/route.ts | admin_settings, atomic_book_nights, atomic_cancel_night, child_emergency_contacts, child_medical_profiles, children, overnight_blocks, parents, plans, program_capacity, programs, promote_waitlist, reservation_events, reservation_nights, reservations, waitlist | facility context + facility_id scoping present | custom auth | PASS |
| src/app/api/capacity/route.ts | admin_settings, program_capacity, programs | facility context + facility_id scoping present | custom auth | PASS |
| src/app/api/children/[id]/allergies/route.ts | child_allergies, child_allergy_action_plans, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/attendance/route.ts | child_attendance_sessions, child_events, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/authorized-pickups/route.ts | child_authorized_pickups, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/details/route.ts | child_allergies, child_authorized_pickups, child_emergency_contacts, child_immunization_records, child_medical_profiles, children, medication_authorizations | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/documents/route.ts | child_documents, child_events, children, private | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/emergency-contacts/route.ts | child_authorized_pickups, child_emergency_contacts, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/events/route.ts | child_events, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/export/route.ts | child_allergies, child_authorized_pickups, child_documents, child_emergency_contacts, child_immunization_records, child_medical_profiles, children, medication_authorizations, parents | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/immunization/route.ts | child_events, child_immunization_records, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/incidents/route.ts | child_events, children, incident_reports | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/medical-profile/route.ts | child_medical_profiles, children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/[id]/medications/route.ts | child_events, children, medication_authorizations | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/children/route.ts | children | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/dashboard/route.ts | children, overnight_blocks, parents, reservation_events, reservations, subscriptions, waitlist | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/emergency-contacts/[id]/route.ts | child_emergency_contacts | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/medications/[id]/route.ts | child_events, children, medication_authorizations | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/onboarding-status/route.ts | child_emergency_contacts, children, parents | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/profile/route.ts | parents | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/reservations/[id]/events/route.ts | reservation_events, reservations | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/reservations/detail/route.ts | children, overnight_blocks, reservation_events, reservations | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/reservations/route.ts | children, overnight_blocks, reservations | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/settings/route.ts | parent_settings, parents | facility context + facility_id scoping present | parent auth + ownership | PASS |
| src/app/api/stripe/route.ts | overnight_blocks, parents | facility context + facility_id scoping present | custom auth | PASS |
| src/app/api/stripe/webhook/route.ts | overnight_blocks, payments, reservation_events, reservations | platform-only webhook path | none | PASS |

**FAIL_COUNT=0**

## Tenant isolation test coverage added
- Added `test/tenancy-isolation-access.test.js` with checks covering:
  - parent facility scoping (`/api/children`, `/api/reservations`)
  - facility admin/staff facility scoping path (`/api/admin/pickup-verification`)
  - platform role guard surface (`checkPlatformAdmin`, `checkPlatformSupport`)
  - facility-aware stripe tenant lookup path (`/api/stripe`)

## RLS coverage table
| table/group | RLS status | facility-aware status | note |
|---|---|---|---|
| facilities | enabled | yes | platform + membership-gated policies |
| facility_memberships | enabled | yes | platform-admin write; membership read constraints |
| platform_audit_logs | enabled | yes | platform-only |
| platform_fee_records | enabled | yes | platform-only |
| core operational tables (children/reservations/events/etc.) | mixed pre-existing | partial | many policies are ownership/admin oriented; additional facility predicates still recommended |

## Service-role usage inventory
| path | service-role usage | mitigation |
|---|---|---|
| `src/app/api/bookings/route.ts` | high (multi-table reads/writes + RPC) | facility session required; facility filters and payload propagation added |
| `src/app/api/capacity/route.ts` | medium | facility session required; facility filters on reads/writes added |
| `src/app/api/stripe/route.ts` | medium | facility session required; facility filters for tenant block/parent lookups |
| `src/app/api/admin/*` | medium-high | centralized `checkAdmin`; facility context required for tenant paths |

## RPC facility propagation audit
- `promote_waitlist`: caller now enforces post-RPC facility boundary by fetching promoted row with `facility_id` and rejecting cross-facility results.
- `atomic_book_nights` / `atomic_cancel_night`: caller path now carries facility context and propagates `facility_id` into related reservation/reservation_night/event writes.

## Enterprise hardening checks
- Legacy scattered admin role checks removed in patched files and replaced by centralized admin guard.
- Facility context required for patched custom-auth routes.
- Coverage matrix regenerated with explicit PASS/FAIL classification.
- Remaining blast-radius is primarily in service-role architecture itself; scoped filters are now present in patched high-risk paths.
