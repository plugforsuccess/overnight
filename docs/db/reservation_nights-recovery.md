# `reservation_nights` Migration Recovery Runbook

## Summary

`reservation_nights` was referenced by downstream migrations but never created in migration history. This runbook repairs ordering and replays the chain safely.

## Correct migration order

1. `0_baseline`
2. `20260306000002_create_parent_settings`
3. `20260307000001_harden_parent_onboarding`
4. `20260307000002_enterprise_hardening`
5. `20260307000003_operational_hardening`
6. `20260307000004_sprint_hardening`
7. `20260307235959_create_reservation_nights` ✅ (new)
8. `20260308000001_attendance_records`
9. `20260308000002_capacity_overrides`
10. `20260308000003_health_checks`
11. `20260308000004_billing_ledger`

## Recovery steps

> Run from repo root with production environment variables loaded.

1. Inspect current migration status.

```bash
npx prisma migrate status
```

2. Mark the failed attendance migration as rolled back so Prisma can continue cleanly.

```bash
npx prisma migrate resolve --rolled-back 20260308000001_attendance_records
```

3. (Optional but recommended) verify migration chain references before deploy.

```bash
npx tsx scripts/audit-migrations.ts
```

4. Apply migrations in corrected order.

```bash
npx prisma migrate deploy
```

5. Re-run deploy to confirm idempotent clean state.

```bash
npx prisma migrate deploy
```

6. Validate repaired tables now exist.

```bash
npx prisma db execute --stdin <<'SQL'
SELECT to_regclass('public.reservation_nights') AS reservation_nights,
       to_regclass('public.attendance_records') AS attendance_records,
       to_regclass('public.attendance_events') AS attendance_events;
SQL
```

## Notes

- The repair migration intentionally does **not** add a `program_capacity_id` FK, because `program_capacity` is not guaranteed to exist in all historical chain states before attendance deploy.
- `reservation_id` and `child_id` foreign keys are applied because those tables are present in baseline history.
