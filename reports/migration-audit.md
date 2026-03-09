# Migration Audit Report

Generated: 2026-03-09T00:47:07.114Z

## Findings
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid
- **warning** [SHADOW_AUTH] Supabase auth schema reference: auth.uid
- **critical** [MIGRATION_TABLE_ORDER] 20260308000001_attendance_records depends on table reservation_nights before creation
- **critical** [MIGRATION_TABLE_ORDER] 20260308000002_capacity_overrides depends on table centers before creation
- **critical** [MIGRATION_TABLE_ORDER] 20260308000002_capacity_overrides depends on table programs before creation
- **critical** [MIGRATION_TABLE_ORDER] 20260308000004_billing_ledger depends on table reservation_nights before creation
- **critical** [SCHEMA_TABLE_MISSING_FROM_MIGRATIONS] Table centers present in schema but never created in migrations
- **critical** [SCHEMA_TABLE_MISSING_FROM_MIGRATIONS] Table programs present in schema but never created in migrations
- **critical** [SCHEMA_TABLE_MISSING_FROM_MIGRATIONS] Table program_capacity present in schema but never created in migrations
- **critical** [SCHEMA_TABLE_MISSING_FROM_MIGRATIONS] Table reservation_nights present in schema but never created in migrations
- **warning** [DB_UNAVAILABLE] DATABASE_URL not set
