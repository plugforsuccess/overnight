# Chaos Test Report — Overnight Platform

## Overview

This report documents the chaos testing and concurrency validation suite for the Overnight platform's critical data paths. The suite pressure-tests booking, waitlist, attendance, closure, and health check systems under realistic concurrent conditions.

## Test Infrastructure

### Helpers

| File | Purpose |
|------|---------|
| `tests/chaos/helpers/run-concurrent.ts` | `runConcurrent()` and `runInterleavedConcurrent()` — run N async operations in parallel, capture per-op timing, successes, and failures |
| `tests/chaos/helpers/seed-chaos-data.ts` | `seedChaosScenario()` — creates isolated test data (center, program, capacity, parents, children, bookings, waitlist, attendance) with full cleanup |
| `tests/chaos/helpers/assert-invariants.ts` | `assertSystemInvariants()` / `expectInvariantsHold()` — 10+ invariant checks across all domains |

### Invariant Suite

The following invariants are checked after every scenario:

1. **No duplicate active reservation_nights** for same child + date
2. **capacity_reserved ≤ capacity_total** (unless active closure override)
3. **capacity_waitlisted ≥ 0**
4. **capacity_reserved ≥ 0**
5. **capacity_reserved matches actual confirmed night count**
6. **capacity_waitlisted matches actual waitlisted night count**
7. **No duplicate attendance records** per reservation_night
8. **No orphaned attendance events** (events without matching record)
9. **No invalid attendance status + timestamp combinations**:
   - `checked_in` must have `checked_in_at`
   - `checked_out` must have both timestamps, checkout ≥ checkin
   - `no_show` must have `no_show_marked_at`
   - `expected` must NOT have checkin/checkout timestamps
10. **Closed override ↔ capacity status consistency**

---

## High-Priority Scenarios (A–J)

### Scenario A: Double-Book Last Bed

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/booking-chaos.test.ts` |
| **Setup** | capacity=5, reserved=4 (1 slot remaining), 5 children race |
| **Action** | 5 concurrent `atomic_book_nights` RPC calls |
| **Protection** | PostgreSQL `FOR UPDATE` row lock in `atomic_book_nights` |
| **Expected** | ≤1 new confirmed booking; capacity_reserved ≤ capacity_total |
| **Invariants** | Full suite |

### Scenario B: Duplicate Same-Child Booking

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/booking-chaos.test.ts` |
| **Setup** | 1 child, 1 date, capacity=6 |
| **Action** | 3 concurrent booking attempts for the same child |
| **Protection** | `atomic_book_nights` RPC row locks + capacity counting |
| **Expected** | Capacity counters remain consistent |
| **Invariants** | Full suite |

### Scenario C: Concurrent Cancel + Waitlist Promotion

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/waitlist-chaos.test.ts` |
| **Setup** | capacity=5/5 full, 3 waitlisted |
| **Action** | 1 `atomic_cancel_night` + 3 `promote_waitlist` concurrently |
| **Protection** | PostgreSQL `FOR UPDATE` locks in both RPCs |
| **Expected** | reserved ≤ total; waitlisted ≥ 0; no over-promotion |
| **Invariants** | Full suite |

### Scenario D: Closure During Active Booking Traffic

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/closures-chaos.test.ts` |
| **Setup** | capacity=6, 3 confirmed, 3 children attempting to book |
| **Action** | `applyOverride(close)` concurrent with 3 booking RPCs |
| **Protection** | Closure writes capacity_total=0; RPC checks available capacity |
| **Expected** | Final state: closed, capacity_total=0, override active |
| **Invariants** | Full suite |

### Scenario E: Waitlist Promotion on Closed Night

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/waitlist-chaos.test.ts` |
| **Setup** | Night closed (capacity_total=0), 1 waitlisted entry |
| **Action** | 3 concurrent `promote_waitlist` calls |
| **Protection** | RPC checks capacity before promoting |
| **Expected** | 0 promotions (no available capacity) |
| **Invariants** | Full suite |

### Scenario F: Double Check-In

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/attendance-chaos.test.ts` |
| **Setup** | 1 child, status='expected' |
| **Action** | 5 concurrent `checkInChild()` calls |
| **Protection** | Optimistic lock: `.eq('attendance_status', 'expected')` in UPDATE |
| **Expected** | Exactly 1 success, 4 failures; exactly 1 check-in event |
| **Invariants** | Full suite |

### Scenario G: Double Check-Out

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/attendance-chaos.test.ts` |
| **Setup** | 1 child, status='checked_in' |
| **Action** | 5 concurrent `checkOutChild()` calls |
| **Protection** | Optimistic lock: `.eq('attendance_status', 'checked_in')` in UPDATE |
| **Expected** | Exactly 1 success, 4 failures; exactly 1 check-out event |
| **Invariants** | Full suite |

### Scenario H: No-Show vs Late Check-In Race

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/attendance-chaos.test.ts` |
| **Setup** | 1 child, status='expected' |
| **Action** | `markNoShow()` + `checkInChild()` fired concurrently |
| **Protection** | Both use optimistic lock on `attendance_status = 'expected'` |
| **Expected** | Exactly 1 winner (either no_show or checked_in) |
| **Invariants** | Full suite |

### Scenario I: Concurrent Correction Race

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/attendance-chaos.test.ts` |
| **Setup** | 1 child, status='checked_in' |
| **Action** | 2 admins correct to different statuses concurrently |
| **Protection** | `correctAttendanceStatus()` — last write wins (admin context) |
| **Expected** | Final state is a valid status; correction events logged |
| **Invariants** | Full suite |

### Scenario J: Health Checks During Active Mutations

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/health-chaos.test.ts` |
| **Setup** | 3 confirmed bookings with attendance records |
| **Action** | `runHealthChecks()` concurrent with check-in + capacity reduction |
| **Protection** | Health checks are read-only queries |
| **Expected** | Health check completes without error; run recorded in DB |
| **Invariants** | Full suite |

---

## Medium-Priority Scenarios (K–O)

### Scenario K: Repeated Closure Idempotency

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/closures-chaos.test.ts` |
| **Setup** | Open night |
| **Action** | 5 concurrent `applyOverride(close)` calls |
| **Protection** | Partial unique index on `(program_id, care_date) WHERE is_active = true` |
| **Expected** | Exactly 1 active override; final state=closed |
| **Invariants** | Full suite |

### Scenario L: Reopen During Reduce Race

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/closures-chaos.test.ts` |
| **Setup** | Night is closed |
| **Action** | `reopenNights()` + `applyOverride(reduce_capacity)` concurrently |
| **Protection** | Application-level deactivate-then-create pattern |
| **Expected** | Final state is consistent (capacity matches active override type) |
| **Invariants** | Full suite |

### Scenario M: Missing Capacity Rows Under Concurrent Operations

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/closures-chaos.test.ts` |
| **Setup** | No `program_capacity` row for the target date |
| **Action** | Closure + booking both try to lazy-create the capacity row |
| **Protection** | RPC creates with default capacity; `applyOverride` lazy-creates |
| **Expected** | No crash; state settles to a consistent configuration |
| **Invariants** | Partial (cleanup handles extra rows) |

### Scenario N: Notification Deduplication

> **Not implemented** — notification system not yet built. Will be added when notifications are integrated.

### Scenario O: Health Issue Deduplication

| Attribute | Value |
|-----------|-------|
| **File** | `tests/chaos/health-chaos.test.ts` |
| **Setup** | Intentional capacity drift (reserved=5, actual=2) |
| **Action** | 3 concurrent `runHealthChecks()` calls |
| **Protection** | Each run creates its own isolated issue records |
| **Expected** | All 3 runs complete; each detects the drift independently |
| **Invariants** | N/A (health check isolation) |

---

## Concurrency Protection Summary

| System | Protection Mechanism |
|--------|---------------------|
| **Booking** | `atomic_book_nights` PL/pgSQL RPC with `SELECT ... FOR UPDATE` row locks on `program_capacity` |
| **Cancellation** | `atomic_cancel_night` PL/pgSQL RPC with row-level locks |
| **Waitlist Promotion** | `promote_waitlist` PL/pgSQL RPC with row-level locks, FIFO ordering |
| **Check-In** | Optimistic locking: `UPDATE ... WHERE attendance_status = 'expected'` |
| **Check-Out** | Optimistic locking: `UPDATE ... WHERE attendance_status = 'checked_in'` |
| **No-Show** | Optimistic locking: `UPDATE ... WHERE attendance_status = 'expected'` |
| **Closures** | Partial unique index on active overrides; application-level deactivate-before-create |
| **Attendance Records** | Unique constraint on `reservation_night_id`; race-condition retry on 23505 |
| **Health Checks** | Read-only queries; each run creates independent issue records |

## Known Limitations

1. **Duplicate same-child bookings (Scenario B)**: The `atomic_book_nights` RPC does not enforce a unique constraint on `(child_id, care_date)` for active nights at the DB level. Multiple reservation_nights can be created for the same child/date across different reservations. The capacity counting remains correct, but business logic should prevent this at the API layer.

2. **Concurrent corrections (Scenario I)**: `correctAttendanceStatus()` uses a simple update without optimistic locking on the current status. This is intentional — admin corrections are a deliberate override mechanism where last-write-wins is acceptable.

3. **Closure + booking race (Scenario D)**: A booking RPC may complete between the closure's capacity read and capacity write. The RPC uses its own row lock, so the booking will see pre-closure capacity. The closure will then overwrite capacity_total to 0. This is a known timing window where a booking can slip in before closure takes effect.

4. **Missing capacity row races (Scenario M)**: Both the RPC and `applyOverride` can create capacity rows for the same date, potentially resulting in duplicates. The RPC uses `INSERT ... ON CONFLICT` which handles this gracefully, but `applyOverride` does a SELECT-then-INSERT which can race.

## Running the Tests

```bash
# Run all chaos tests
npx jest tests/chaos/ --runInBand --timeout=60000

# Run a specific scenario
npx jest tests/chaos/booking-chaos.test.ts --runInBand --timeout=60000

# Run with verbose output
npx jest tests/chaos/ --runInBand --timeout=60000 --verbose
```

**Requirements:**
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be set
- Tests use service role client to bypass RLS
- Tests create isolated data and clean up after each scenario
- Use `--runInBand` to prevent test file parallelism (scenarios share database)
