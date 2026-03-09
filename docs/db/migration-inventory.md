# Migration Inventory

## 0_baseline

- Creates: parents, children, child_allergies, child_allergy_action_plans, child_emergency_contacts, child_authorized_pickups, plans, overnight_blocks, reservations, nightly_capacity, waitlist, payments, admin_settings, credits, audit_log, config, stripe_prices, subscriptions, pending_plan_changes, billing_events
- Alters: children, child_allergies, child_allergy_action_plans, child_emergency_contacts, child_authorized_pickups, overnight_blocks, overnight_blocks, overnight_blocks, reservations, reservations, waitlist, waitlist, payments, payments, credits, credits, audit_log, subscriptions, pending_plan_changes, billing_events
- Depends on: parents, children, child_allergies, plans, overnight_blocks, subscriptions, child_allergy_action_plans, child_emergency_contacts, reservations, waitlist, payments, credits, audit_log, stripe_prices, pending_plan_changes, billing_events
- Unsafe assumptions: none

## 20260306000002_create_parent_settings

- Creates: parent_settings
- Alters: parent_settings, parent_settings
- Depends on: parents, parent_settings
- Unsafe assumptions: Supabase auth schema reference: auth.uid

## 20260307000001_harden_parent_onboarding

- Creates: child_medical_profiles
- Alters: parents, parents, parents, children, child_emergency_contacts, child_authorized_pickups, child_authorized_pickups, child_medical_profiles
- Depends on: children
- Unsafe assumptions: Supabase auth schema reference: auth.uid

## 20260307000002_enterprise_hardening

- Creates: child_events, child_attendance_sessions, pickup_events
- Alters: child_attendance_sessions, child_attendance_sessions, child_emergency_contacts, child_events, child_attendance_sessions, audit_log, pickup_events
- Depends on: children, reservations, child_authorized_pickups, parents
- Unsafe assumptions: Supabase auth schema reference: auth.uid

## 20260307000003_operational_hardening

- Creates: reservation_events, incident_reports, center_staff_memberships, pickup_verifications
- Alters: incident_reports, incident_reports, incident_reports, incident_reports, center_staff_memberships, center_staff_memberships, reservation_events, incident_reports, center_staff_memberships, pickup_verifications
- Depends on: reservations, children, child_attendance_sessions, parents
- Unsafe assumptions: Supabase auth schema reference: auth.uid

## 20260307000004_sprint_hardening

- Creates: idempotency_keys, center_staff_memberships, incident_reports, pickup_verifications
- Alters: idempotency_keys, children, child_authorized_pickups, child_emergency_contacts, center_staff_memberships, center_staff_memberships, center_staff_memberships, center_staff_memberships, overnight_blocks, incident_reports, pickup_verifications
- Depends on: parents, children, child_attendance_sessions
- Unsafe assumptions: none

## 20260308000000_create_centers_programs

- Creates: centers, programs
- Alters: programs
- Depends on: centers, programs
- Unsafe assumptions: none

## 20260308000001_attendance_records

- Creates: attendance_records, attendance_events
- Alters: attendance_records, attendance_records, attendance_records, attendance_records, attendance_records, attendance_records, attendance_records, attendance_records, attendance_events, attendance_events
- Depends on: reservation_nights, attendance_records
- Unsafe assumptions: none

## 20260308000002_capacity_overrides

- Creates: capacity_overrides, capacity_override_events
- Alters: capacity_overrides, capacity_overrides, capacity_override_events
- Depends on: centers, programs, capacity_overrides, capacity_override_events
- Unsafe assumptions: none

## 20260308000003_health_checks

- Creates: health_check_runs, health_issues
- Alters: health_issues
- Depends on: health_check_runs, health_issues
- Unsafe assumptions: none

## 20260308000004_billing_ledger

- Creates: billing_ledger
- Alters: none
- Depends on: parents, reservation_nights, children, billing_ledger
- Unsafe assumptions: none

## 20260309000001_child_licensing_compliance

- Creates: child_documents, child_immunization_records, medication_authorizations, medication_administration_logs
- Alters: child_documents
- Depends on: children, medication_authorizations, child_documents, medication_administration_logs
- Unsafe assumptions: none

## 202603090001_daycare_tenancy_merge

- Creates: facilities, facility_memberships, platform_audit_logs, platform_fee_records
- Alters: facilities, facility_memberships, platform_audit_logs, platform_fee_records
- Depends on: facilities, auth.users
- Unsafe assumptions: Supabase auth schema reference: auth.users; Supabase auth schema reference: auth.uid
