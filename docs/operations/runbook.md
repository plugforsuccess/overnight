# Overnight Platform — Operational Runbook

## Overview

This runbook covers common operational procedures for the Overnight childcare platform. It is designed for administrators and on-call engineers managing the production system.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run preflight` | Pre-deployment environment & database checks |
| `npm run ops:capacity-check` | Detect and fix capacity counter drift |
| `npm run audit:routes` | Security audit of all routes |
| `npm run smoke-test` | End-to-end functionality verification |
| `./scripts/smoke-test.sh` | HTTP-based E2E smoke test (requires running app) |

---

## 1. Booking Failure

### Symptoms
- Parent reports "booking failed" or "night unavailable"
- Capacity shows 0 available but admin sees no reservations
- Bookings succeed but don't appear in dashboard

### Diagnosis Steps

1. **Run capacity reconciliation**
   ```bash
   npm run ops:capacity-check
   ```
   This compares `program_capacity` counters against actual `reservation_nights` rows and auto-fixes drift.

2. **Inspect health dashboard**
   - Navigate to `/admin/health` in the admin panel
   - Click "Run Health Check" to trigger fresh analysis
   - Review capacity, attendance, and waitlist issues

3. **Check for closures blocking the date**
   ```
   GET /api/admin/closures?start=YYYY-MM-DD&end=YYYY-MM-DD
   ```
   Look for `override_type: 'close'` entries covering the target date.

4. **Check waitlist promotions**
   - Navigate to `/admin/waitlist-ops`
   - If capacity freed up but waitlisted entries exist, promote manually
   - Or call: `POST /api/admin/waitlist-promote` with `{ careDate: "YYYY-MM-DD" }`

5. **Verify RPC availability**
   ```bash
   npm run preflight
   ```
   Ensure `atomic_book_nights` and `ensure_capacity_rows` RPCs are available.

### Resolution
- If drift detected: `ops:capacity-check` auto-fixes
- If closure blocking: reopen via `/admin/closures` or API
- If RPC missing: check migration status with `npm run migrate:status`

---

## 2. Attendance Errors

### Symptoms
- Tonight's dashboard shows wrong child count
- Check-in/check-out buttons don't respond
- Attendance records missing for confirmed reservations

### Diagnosis Steps

1. **Inspect tonight's dashboard**
   - Navigate to `/admin/tonight`
   - The page auto-calls `ensureAttendanceForDate()` on load, which creates missing attendance records

2. **Check for data mismatches**
   ```
   GET /api/admin/attendance/tonight
   ```
   Compare returned attendance records count against expected reservations.

3. **Run attendance correction** (if status is wrong)
   ```
   POST /api/admin/attendance/correct
   {
     "attendanceRecordId": "<uuid>",
     "newStatus": "expected|checked_in|checked_out|no_show",
     "reason": "Correcting status after system error"
   }
   ```

4. **Check audit events**
   Query `attendance_events` for the affected record to see status history:
   - `child_checked_in`
   - `child_checked_out`
   - `no_show_marked`
   - `attendance_status_corrected`

### Resolution
- Missing records: reload `/admin/tonight` to trigger auto-heal
- Wrong status: use attendance correction API
- Persistent issues: run health checks to identify systemic problems

---

## 3. Capacity Issues

### Symptoms
- Admin sees incorrect available spots
- Capacity counters don't match actual reservations
- Overbooking alerts in health dashboard

### Diagnosis Steps

1. **Inspect closures**
   - Navigate to `/admin/closures`
   - Check for capacity overrides that may be reducing available spots

2. **Run capacity reconciliation**
   ```bash
   npm run ops:capacity-check
   ```
   Output shows:
   - `nights_checked`: total capacity rows examined
   - `drift_detected`: rows where counters don't match reality
   - `drift_fixed`: rows corrected

3. **Review override history**
   Query `capacity_override_events` to see recent changes:
   - `night_closed` — capacity set to 0
   - `capacity_reduced` — capacity lowered
   - `night_reopened` — capacity restored
   - `capacity_override_deactivated` — override removed

4. **Verify program settings**
   Check `admin_settings.max_capacity` for the configured default capacity.

### Resolution
- Drift: auto-fixed by `ops:capacity-check`
- Incorrect overrides: adjust via `/admin/closures` UI
- Missing capacity rows: `ensure_capacity_rows` RPC creates them on demand

---

## 4. Waitlist Issues

### Symptoms
- Family reports being on waitlist but not promoted when spots open
- Waitlist queue appears stuck
- Promoted families still showing as waitlisted

### Diagnosis Steps

1. **Run waitlist promotion**
   ```
   POST /api/admin/waitlist-promote
   { "careDate": "YYYY-MM-DD" }
   ```
   Returns either promoted night details or "No waitlisted entries to promote."

2. **Check closure conflicts**
   - A closed night cannot accept promotions
   - Verify the target date is not under a closure override

3. **Verify capacity**
   ```bash
   npm run ops:capacity-check
   ```
   Ensure the target date has available capacity (reserved_count < total_capacity).

4. **Inspect waitlist queue**
   - Navigate to `/admin/waitlist-ops` or `/admin/waitlist`
   - Review families in waitlist order (FIFO by `created_at`)

### Resolution
- Manual promotion via admin UI or API
- Clear conflicting closures first
- Run capacity reconciliation if counters are stale

---

## 5. Health System Issues

### Symptoms
- Health dashboard shows stale data
- Health checks not running
- Health runner appears stuck

### Diagnosis Steps

1. **Bootstrap health system**
   ```
   GET /api/admin/health/bootstrap
   ```
   Returns `HEALTH_SYSTEM_OK` or `HEALTH_SYSTEM_DEGRADED` with specific check failures.

2. **Check for stuck runs**
   Look for health check runs with `status='running'` older than 5 minutes. The bootstrap endpoint checks this automatically.

3. **Manual health check**
   ```
   POST /api/admin/health/run
   ```
   Triggers a fresh health check run covering capacity, attendance, and waitlist.

### Resolution
- Stuck runs: update status to `failed` in `health_check_runs` table
- Degraded system: investigate specific check failures from bootstrap response
- Stale data: trigger manual health check run

---

## 6. Pre-Deployment Checklist

Before every production deployment:

1. **Run preflight checks**
   ```bash
   npm run preflight
   ```
   Must pass with no failures.

2. **Run route security audit**
   ```bash
   npm run audit:routes
   ```
   Must show 0 critical findings.

3. **Run smoke test**
   ```bash
   npm run smoke-test
   ```
   Must pass all steps.

4. **Check migration status**
   ```bash
   npm run migrate:status
   ```
   All migrations must be applied.

5. **Review health dashboard**
   Navigate to `/admin/health` and ensure no critical issues.

---

## 7. Backup Strategy

### Database Backups

| Aspect | Detail |
|--------|--------|
| **Provider** | Supabase managed backups |
| **Frequency** | Daily automatic backups (Supabase Pro plan) |
| **Point-in-time recovery** | Available on Pro plan (up to 7 days) |
| **Retention** | 7 days for daily backups |

### Restore Procedure

1. **From Supabase Dashboard**
   - Navigate to Project Settings → Database → Backups
   - Select the backup point to restore
   - Confirm restoration (this replaces current data)

2. **Point-in-time Recovery**
   - Available on Supabase Pro plan
   - Navigate to Database → Backups → Point in Time
   - Select exact timestamp to restore to

3. **Manual Backup**
   ```bash
   pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

4. **Manual Restore**
   ```bash
   psql "$DATABASE_URL" < backup_YYYYMMDD_HHMMSS.sql
   ```

### Snapshot Retention

| Type | Retention | Notes |
|------|-----------|-------|
| Daily automated | 7 days | Supabase managed |
| Pre-migration manual | 30 days | Take before schema changes |
| Pre-deployment manual | 14 days | Take before major releases |

### Critical Data to Protect

- `parents` — user accounts
- `children` — child profiles
- `reservations` + `reservation_nights` — booking history
- `child_attendance_sessions` — attendance records
- `audit_log` — security audit trail
- `reservation_events` + `attendance_events` — event history

---

## 8. Incident Response

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **P1 — Critical** | System down, data loss risk, security breach | Immediate |
| **P2 — High** | Feature broken, bookings failing, attendance broken | Within 1 hour |
| **P3 — Medium** | Degraded performance, non-critical feature broken | Within 4 hours |
| **P4 — Low** | UI issue, minor bug, cosmetic | Next business day |

### Immediate Actions for P1/P2

1. Check application health: `npm run preflight`
2. Check for stuck processes or locked resources
3. Review recent deployments — rollback if necessary
4. Check Supabase dashboard for database issues
5. Run health bootstrap: `GET /api/admin/health/bootstrap`

### Post-Incident

1. Document what happened and when
2. Identify root cause
3. Run full smoke test to verify resolution
4. Update this runbook if new procedures were needed
