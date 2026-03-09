# Migration Ordering Violations

- **warning** Supabase auth schema reference: auth.uid (20260306000002_create_parent_settings)
- **warning** Supabase auth schema reference: auth.uid (20260307000001_harden_parent_onboarding)
- **warning** Supabase auth schema reference: auth.uid (20260307000002_enterprise_hardening)
- **warning** Supabase auth schema reference: auth.uid (20260307000003_operational_hardening)
- **critical** 20260308000001_attendance_records depends on table reservation_nights before creation (20260308000001_attendance_records)
- **critical** 20260308000004_billing_ledger depends on table reservation_nights before creation (20260308000004_billing_ledger)
- **critical** 202603090001_daycare_tenancy_merge depends on table auth.users before creation (202603090001_daycare_tenancy_merge)
- **warning** Supabase auth schema reference: auth.users (202603090001_daycare_tenancy_merge)
- **warning** Supabase auth schema reference: auth.uid (202603090001_daycare_tenancy_merge)