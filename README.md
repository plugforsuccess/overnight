# DreamWatch Overnight — Childcare Booking MVP

A full-stack booking platform for a licensed overnight childcare program (FCCLH) in Georgia. Built with Next.js 14, Supabase, Stripe, and Tailwind CSS.

## Features

### Parent-facing
- **Home page** with program info and CTA
- **Pricing page** with 5 weekly tiers (1–5 nights)
- **Schedule/Reserve** — step-by-step wizard: pick child → pick plan → pick nights → confirm & pay
- **Parent Dashboard** — view upcoming nights, active plans, payment history, waitlist status
- **Child Management** — add/edit children with DOB, allergies, emergency contacts, authorized pickup
- **Payment History** — view all Stripe transactions

### Admin Panel
- **Nightly Roster** — view children booked per night with emergency contacts, navigate by week
- **Active Plans** — view/pause/cancel/comp plans, see total revenue
- **Waitlist Management** — offer spots, promote to confirmed, remove entries
- **Settings** — configurable capacity, operating nights, pricing tiers, billing day/time, waitlist confirmation window, overnight hours

### Business Logic
- **Capacity enforcement**: max 6 children per night (configurable)
- **Tiered weekly pricing**: $95/1 night → $375/5 nights (cheaper per night as count increases)
- **Waitlist**: FCFS with configurable confirmation window
- **Stripe integration**: weekly subscriptions via Checkout Sessions, webhook handling for invoice events
- **Operating nights**: Sun–Thu default, fully configurable in admin

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Payments | Stripe (Subscriptions + Checkout) |
| Icons | Lucide React |
| Date Utilities | date-fns |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home
│   ├── pricing/page.tsx            # Pricing
│   ├── policies/page.tsx           # Policies & FAQ
│   ├── schedule/page.tsx           # Reserve nights (wizard)
│   ├── login/page.tsx              # Login
│   ├── signup/page.tsx             # Signup
│   ├── dashboard/
│   │   ├── page.tsx                # Parent dashboard
│   │   ├── children/page.tsx       # Manage children
│   │   └── payments/page.tsx       # Payment history
│   ├── admin/
│   │   ├── page.tsx                # Admin dashboard
│   │   ├── roster/page.tsx         # Nightly roster
│   │   ├── plans/page.tsx          # Active plans
│   │   ├── waitlist/page.tsx       # Waitlist management
│   │   └── settings/page.tsx       # Program settings
│   └── api/
│       ├── auth/signup/route.ts    # Signup API
│       ├── children/route.ts       # CRUD children
│       ├── bookings/route.ts       # Create/manage bookings
│       ├── stripe/route.ts         # Create checkout session
│       ├── stripe/webhook/route.ts # Stripe webhooks
│       └── admin/route.ts          # Admin operations
├── components/
│   ├── navbar.tsx
│   └── footer.tsx
├── lib/
│   ├── constants.ts                # Pricing, day labels, helpers
│   ├── stripe.ts                   # Stripe server SDK
│   ├── supabase-client.ts          # Browser Supabase client
│   ├── supabase-server.ts          # Server Supabase client (service role)
│   └── utils.ts                    # Date/scheduling utilities
└── types/
    └── database.ts                 # TypeScript types
```

## Setup & Deployment

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase-schema.sql`
3. Copy your project URL and keys

### 2. Stripe Setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get your test API keys from the Dashboard
3. Set up a webhook endpoint pointing to `https://your-domain.com/api/stripe/webhook`
   - Events to listen for: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`

### 3. Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### 4. Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Deploy to Vercel

1. Push your code to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add all environment variables from `.env.example`
4. Deploy

### 6. Create Admin User

After deploying, sign up normally, then in Supabase SQL Editor:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your-admin@email.com';
```

## Pricing Tiers

| Nights/Week | Weekly Price | Per Night |
|-------------|-------------|-----------|
| 1 | $95 | $95 |
| 2 | $180 | $90 |
| 3 | $255 | $85 |
| 4 | $320 | $80 |
| 5 | $375 | $75 |

## Data Model

- **profiles** — extends Supabase auth, stores parent/admin info + Stripe customer ID
- **children** — child profiles with medical/emergency info
- **plans** — weekly booking plans (nights_per_week, price, status)
- **reservations** — per-night confirmed bookings
- **waitlist** — FCFS waitlist entries with offer/expiry tracking
- **admin_settings** — singleton config for capacity, pricing, operating nights, billing
- **payments** — Stripe payment event tracking

## License

Private — All rights reserved.
