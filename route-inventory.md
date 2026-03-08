# Overnight Platform — Route Inventory & Auth Matrix

## Route Tree

```
/                               PUBLIC        Landing page
/login                          AUTH          Login (redirects if authenticated)
/signup                         AUTH          Signup + onboarding flow
/pricing                        PUBLIC        Pricing page
/policies                       PUBLIC        Policies & FAQ
/schedule                       PARENT        Booking flow (calendar → child → confirm)

/dashboard                      PARENT        Parent dashboard (server-side auth via layout)
/dashboard/children             PARENT        Manage child profiles
/dashboard/reservations         PARENT        Reservation list
/dashboard/reservations/[id]    PARENT        Reservation detail
/dashboard/payments             PARENT        Payment history
/dashboard/settings             PARENT        Profile & notification settings

/admin                          ADMIN         Admin dashboard (server-side auth via layout)
/admin/tonight                  ADMIN         Tonight's attendance (check-in/out/no-show)
/admin/waitlist-ops             ADMIN         Waitlist queue & promotions
/admin/capacity                 ADMIN         4-week capacity planner
/admin/closures                 ADMIN         Closure & capacity override management
/admin/health                   ADMIN         System health dashboard
/admin/roster                   ADMIN         Weekly roster view
/admin/plans                    ADMIN         Active plan management
/admin/waitlist                 ADMIN         Waitlist family management
/admin/pickup-verification      ADMIN         Pickup PIN verification
/admin/settings                 ADMIN         System settings (capacity, pricing)
```

## API Routes

### Auth (Public/System)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/auth/signup` | POST | Public (rate-limited) | Create account |
| `/api/auth/me` | POST | Bearer token | Verify JWT, return role |

### Parent API (Authenticated Parent)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/dashboard` | GET | `authenticateRequest()` | Parent dashboard data |
| `/api/children` | GET, POST, PUT, DELETE | `authenticateRequest()` | CRUD children |
| `/api/children/[id]/details` | GET, PUT | `authenticateRequest()` | Child details |
| `/api/children/[id]/allergies` | GET, POST, PUT, DELETE | `authenticateRequest()` | Child allergies |
| `/api/children/[id]/emergency-contacts` | GET, POST, PUT, DELETE | `authenticateRequest()` | Emergency contacts |
| `/api/children/[id]/authorized-pickups` | GET, POST, PUT, DELETE | `authenticateRequest()` | Authorized pickups |
| `/api/children/[id]/medical-profile` | GET, POST, PUT | `authenticateRequest()` | Medical profile |
| `/api/children/[id]/incidents` | GET | `authenticateRequest()` | Incident history |
| `/api/children/[id]/events` | GET | `authenticateRequest()` | Child event log |
| `/api/children/[id]/attendance` | GET | `authenticateRequest()` | Attendance history |
| `/api/bookings` | GET, POST, DELETE, PATCH | `authenticateRequest()` | Booking CRUD + RPC |
| `/api/reservations` | GET | `authenticateRequest()` | List reservations |
| `/api/reservations/detail` | GET | `authenticateRequest()` | Reservation detail |
| `/api/reservations/[id]/events` | GET | `authenticateRequest()` | Reservation events |
| `/api/authorized-pickups/[id]` | PUT, DELETE | `authenticateRequest()` | Pickup person CRUD |
| `/api/emergency-contacts/[id]` | PUT, DELETE | `authenticateRequest()` | Contact CRUD |
| `/api/onboarding-status` | GET, PUT | `authenticateRequest()` | Onboarding progress |
| `/api/settings` | GET, PUT | `authenticateRequest()` | User preferences |
| `/api/capacity` | GET | `authenticateRequest()` | Available capacity |
| `/api/attendance/[id]/pickup-verification` | POST | `authenticateRequest()` | Parent pickup verify |

### Admin API (Authenticated Admin)

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/admin` | GET | `checkAdmin()` | Roster/plans/waitlist views |
| `/api/admin/attendance/tonight` | GET | `checkAdmin()` | Tonight's attendance data |
| `/api/admin/attendance/check-in` | POST | `checkAdmin()` | Check in child |
| `/api/admin/attendance/check-out` | POST | `checkAdmin()` | Check out child |
| `/api/admin/attendance/no-show` | POST | `checkAdmin()` | Mark no-show |
| `/api/admin/attendance/correct` | POST | `checkAdmin()` | Correct attendance status |
| `/api/admin/closures` | GET, POST | `checkAdmin()` | Override management |
| `/api/admin/health/run` | POST | `checkAdmin()` | Trigger health check |
| `/api/admin/health/issues` | GET, POST | `checkAdmin()` | List/resolve health issues |
| `/api/admin/health/runs` | GET | `checkAdmin()` | Health check run history |
| `/api/admin/waitlist-promote` | POST | `checkAdmin()` | Promote waitlist entry |
| `/api/admin/pickup-verification` | GET, POST | `checkAdmin()` | Admin pickup PIN verify |

### System/Integration

| Route | Methods | Auth | Purpose |
|-------|---------|------|---------|
| `/api/stripe` | POST | `authenticateRequest()` | Stripe operations |
| `/api/stripe/webhook` | POST | Stripe signature | Webhook handler |

## Auth Architecture

### Protection Layers

| Layer | Scope | Mechanism |
|-------|-------|-----------|
| **Middleware** | `/dashboard/*`, `/schedule`, `/admin/*` | JWT validation via `getUser()`; redirect to `/login` |
| **Dashboard Layout** | `/dashboard/*` | Server-side `getUser()` + parent profile check |
| **Admin Layout** | `/admin/*` | Server-side `getUser()` + admin role/is_admin check |
| **Admin Pages** | Each `/admin/*` page | Client-side role check (defense-in-depth) |
| **Parent API** | `/api/children/*`, `/api/bookings/*`, etc. | `authenticateRequest()` — Bearer token + parent lookup |
| **Admin API** | `/api/admin/*` | `checkAdmin()` — Bearer token + admin role check |
| **Webhook** | `/api/stripe/webhook` | Stripe signature verification |

### Auth Functions

| Function | Location | Checks |
|----------|----------|--------|
| `authenticateRequest(req)` | `src/lib/api-auth.ts` | Bearer token → `getUser()` → parent profile lookup |
| `checkAdmin(req)` | `src/lib/admin-auth.ts` | Bearer token → `getUser()` → `parents.role='admin'` OR `is_admin=true` |
| `createSupabaseMiddlewareClient(req)` | `src/lib/supabase-middleware.ts` | Cookie-based session for middleware |
| `createSupabaseServerClient()` | `src/lib/supabase-ssr.ts` | Cookie-based session for server components |

## Layouts

| Path | Type | Purpose |
|------|------|---------|
| `src/app/layout.tsx` | Root | Renders `<Navbar />` + `<Footer />` for all pages |
| `src/app/dashboard/layout.tsx` | Server | Auth gate: redirects unauthenticated/non-parent users |
| `src/app/admin/layout.tsx` | Server | Auth gate: redirects non-admin users; renders `<AdminSidebar />` |

## Navigation Components

| Component | Location | Description |
|-----------|----------|-------------|
| `Navbar` | `src/components/navbar.tsx` | Top nav: public/parent/admin links; role-aware admin link |
| `Footer` | `src/components/footer.tsx` | Public footer with quick links |
| `AdminSidebar` | `src/components/admin-sidebar.tsx` | Collapsible sidebar for all admin pages |

## Issues Found & Fixed

### Critical

| Issue | Fix |
|-------|-----|
| `/admin` routes NOT in middleware `PROTECTED_ROUTES` | Added `/admin` to `PROTECTED_ROUTES` (was `/account` which doesn't exist) |
| No admin layout — all admin pages used client-side auth only (flash of content) | Created `src/app/admin/layout.tsx` with server-side auth gate |
| No admin sidebar navigation — users had to return to `/admin` to navigate | Created `src/components/admin-sidebar.tsx` with all admin routes |

### High

| Issue | Fix |
|-------|-----|
| Navbar linked to `/dashboard/emergency-contacts` — page doesn't exist | Removed orphaned link (managed within `/dashboard/children`) |
| Navbar linked to `/dashboard/authorized-pickups` — page doesn't exist | Removed orphaned link (managed within `/dashboard/children`) |
| Navbar didn't detect admin role — no admin link shown | Added role/is_admin fetch; shows Admin link in nav + dropdown for admins |

### Security Hardening (Second Pass)

| Issue | Fix |
|-------|-----|
| `/api/attendance/[id]/pickup-verification` — no parent ownership check | Added `children!inner(parent_id)` join + parent_id validation |
| `/api/reservations/[id]/events` — parent_id fetched but never validated | Added explicit `auth.parentId` comparison |
| Admin attendance routes — no UUID validation on IDs | Added Zod schemas with `.uuid()` for all 4 attendance routes |
| `/api/admin/closures` POST — no format validation on dates/enums | Added Zod schemas for preview/apply/reopen with date regex + enum validation |

### Known Limitations

| Issue | Notes |
|-------|-------|
| Admin pages retain client-side role check | Kept as defense-in-depth alongside server-side layout check |
| `/schedule` accessible before onboarding complete | Booking API validates profile completeness; page-level check is optional |
| Admin routes assume single-center deployment | Queries resolve "first active program" without center_id scoping. Add `center_staff_memberships` filtering when multi-center support is needed |

## Final Route Access Matrix

| Route Pattern | Unauth | Parent | Admin |
|---------------|--------|--------|-------|
| `/`, `/pricing`, `/policies` | Read | Read | Read |
| `/login`, `/signup` | Read | Redirect → `/dashboard` | Redirect → `/dashboard` |
| `/schedule` | Redirect → `/login` | Read/Write | Read/Write |
| `/dashboard/*` | Redirect → `/login` | Read/Write | Read/Write |
| `/admin/*` | Redirect → `/login` | Redirect → `/dashboard` | Read/Write |
| `/api/auth/*` | Read | Read | Read |
| `/api/children/*`, `/api/bookings/*` | 401 | Scoped to own data | N/A |
| `/api/admin/*` | 401 | 401 | Full access |
| `/api/stripe/webhook` | Stripe sig required | N/A | N/A |
