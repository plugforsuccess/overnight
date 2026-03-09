# Schema / Migration / DB Diff

- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid (source: 20260306000002_create_parent_settings)
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid (source: 20260307000001_harden_parent_onboarding)
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid (source: 20260307000002_enterprise_hardening)
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid (source: 20260307000003_operational_hardening)
- **critical** [MIGRATION_TABLE_ORDER] 20260308000001_attendance_records depends on table reservation_nights before creation (source: 20260308000001_attendance_records)
- **critical** [MIGRATION_TABLE_ORDER] 20260308000004_billing_ledger depends on table reservation_nights before creation (source: 20260308000004_billing_ledger)
- **critical** [MIGRATION_TABLE_ORDER] 202603090001_daycare_tenancy_merge depends on table auth.users before creation (source: 202603090001_daycare_tenancy_merge)
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.users (source: 202603090001_daycare_tenancy_merge)
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid (source: 202603090001_daycare_tenancy_merge)
- **critical** [SCHEMA_TABLE_MISSING_FROM_MIGRATIONS] Table program_capacity present in schema but never created in migrations
- **critical** [SCHEMA_TABLE_MISSING_FROM_MIGRATIONS] Table reservation_nights present in schema but never created in migrations
- **warning** [DB_UNAVAILABLE] DATABASE_URL not set