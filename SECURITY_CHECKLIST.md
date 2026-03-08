# Security & Authorization Checklist

> Apply to every new route and API endpoint before merging.

## 1. Route Classification

Every route must be classified:

| Type | Namespace | Example |
|------|-----------|---------|
| Public | `/`, `/pricing` | Landing, pricing, policies |
| Auth | `/login`, `/signup` | Login, registration |
| Parent Auth | `/dashboard/*` | Parent dashboard pages |
| Admin Auth | `/admin/*` | Admin operations pages |
| Parent API | `/api/*` (non-admin) | `/api/children`, `/api/bookings` |
| Admin API | `/api/admin/*` | `/api/admin/attendance/*` |
| System | `/api/stripe/webhook` | Webhook handlers |

- [ ] Route classified in one of the above types
- [ ] Namespace matches classification (admin routes under `/admin`, admin APIs under `/api/admin`)

## 2. Authentication Gate

**Parent routes:**
- [ ] Middleware validates JWT (`PROTECTED_ROUTES` includes the path)
- [ ] Layout provides server-side auth gate (`dashboard/layout.tsx`)
- [ ] API handler calls `authenticateRequest(req)`

**Admin routes:**
- [ ] Middleware validates JWT (`/admin` in `PROTECTED_ROUTES`)
- [ ] Layout provides server-side admin role check (`admin/layout.tsx`)
- [ ] API handler calls `checkAdmin(req)`
- [ ] Non-admin users receive 401 or redirect to `/dashboard`

**Critical:** No client-only auth checks. Server-side validation must happen before rendering.

## 3. Object Ownership Verification

For any route that accesses a resource by ID:

| Resource | Required Check |
|----------|---------------|
| Child | `children.parent_id = auth.parentId` |
| Reservation | `reservation → overnight_block.parent_id = auth.parentId` |
| Overnight Block | `overnight_blocks.parent_id = auth.parentId` |
| Emergency Contact | `children!inner(parent_id) = auth.parentId` |
| Authorized Pickup | `children!inner(parent_id) = auth.parentId` |
| Attendance Session | `children!inner(parent_id) = auth.parentId` |

- [ ] Ownership validated via WHERE clause or post-query check
- [ ] Join enforces parent relationship chain
- [ ] Explicit `auth.parentId` comparison (not just "found a row")

## 4. Tenant / Center Scope

Current deployment: **single-center**. The system resolves the first active program.

When multi-center support is added:
- [ ] Admin queries filtered by `center_id` from admin's `center_staff_memberships`
- [ ] Admin actions scoped to centers where `user_id = admin.id AND active = true`
- [ ] Parent data already scoped by `parent_id` (no center filtering needed)

## 5. Mutation Authorization

For state-changing operations:

- [ ] Authentication verified before any mutation
- [ ] Ownership verified (parent mutations) or admin privilege confirmed (admin mutations)
- [ ] Status transition validated (e.g., can only check in from `expected` status)
- [ ] Optimistic locking used for concurrent-sensitive mutations

| Mutation | Auth Required |
|----------|--------------|
| Create booking | Parent owns child |
| Cancel booking | Parent owns reservation |
| Check-in/out | Admin only |
| Attendance correction | Admin only |
| Close/reduce night | Admin only |
| Resolve health issue | Admin only |

## 6. Audit Logging

Every significant mutation must emit an event:

- [ ] Event emitted to appropriate event table
- [ ] `actor_user_id` / `created_by` recorded
- [ ] Relevant metadata captured (previous state, new state, reason)

| Event Table | Use For |
|-------------|---------|
| `reservation_events` | Booking lifecycle |
| `attendance_events` | Check-in, check-out, no-show, corrections |
| `capacity_override_events` | Closures, reductions, reopenings |
| `child_events` | Child safety events |
| `audit_log` | General admin actions |

## 7. Input Validation

- [ ] Request body validated with Zod schema
- [ ] UUIDs validated with `.uuid()`
- [ ] Enum values validated with `.enum([...])` matching DB CHECK constraints
- [ ] Dates validated with regex or `.datetime()`
- [ ] String lengths bounded with `.max()`
- [ ] Numbers bounded with `.min()` / `.max()` / `.int()`

## 8. Sensitive Data Protection

APIs must NOT return:
- `pickup_pin_hash` (from `child_authorized_pickups`)
- Raw passwords or tokens
- Internal system IDs not needed by the client

- [ ] Sensitive fields excluded from SELECT (explicit column list, not `select('*')`)
- [ ] Response contains only data the client needs
- [ ] Error messages don't leak internal details (table names, SQL errors)

## 9. Middleware Protection

- [ ] `/admin/*` in `PROTECTED_ROUTES` array
- [ ] `/dashboard/*` in `PROTECTED_ROUTES` array
- [ ] `/schedule` in `PROTECTED_ROUTES` array
- [ ] Public routes intentionally excluded
- [ ] Security headers applied (X-Frame-Options, CSP, etc.)

Current config: `src/middleware.ts`

## 10. Health Monitoring Coverage

New data relationships should be covered by health checks:

- [ ] Counter drift detection (if applicable)
- [ ] Orphan detection (parent references exist)
- [ ] Status consistency validation
- [ ] Cross-reference integrity

Health check files: `src/lib/health/check-capacity.ts`, `check-attendance.ts`, `check-waitlist.ts`

## 11. API Namespace Consistency

- [ ] All admin-only APIs under `/api/admin/*`
- [ ] All admin APIs use `checkAdmin()`, not `authenticateRequest()`
- [ ] No admin functionality in parent-facing routes
- [ ] Route naming matches resource (e.g., `/api/admin/attendance/check-in`)

## 12. Security Testing

Before deploy, verify:

- [ ] Ownership tests: parent A cannot access parent B's children/reservations
- [ ] Role tests: parent cannot access admin endpoints (401)
- [ ] Input tests: malformed UUIDs, invalid enums rejected (400)
- [ ] Chaos tests pass (`tests/chaos/`)

## 13. Pre-Merge Review

Reviewer must verify:

- [ ] Auth protection correct for route type
- [ ] Ownership validation present for dynamic routes
- [ ] Audit event emitted for mutations
- [ ] Namespace matches classification
- [ ] ARCHITECTURE.md updated if new route pattern introduced

---

## Definition of a Secure Route

A route is secure when all of the following hold:

1. **Authentication** enforced server-side (middleware + layout + API handler)
2. **Ownership** validated for resource access (parent_id chain)
3. **Mutations** gated by privilege level (parent vs admin)
4. **Events** logged with actor identity
5. **Inputs** validated with typed schemas
6. **Sensitive data** excluded from responses
