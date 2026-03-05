-- ============================================================
-- Overnight Childcare Booking - Supabase Database Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  address text,
  role text not null default 'parent' check (role in ('parent', 'admin')),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles"
  on public.profiles for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'parent')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- CHILDREN
-- ============================================================
create table public.children (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  date_of_birth date not null,
  allergies text,
  medical_notes text,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  authorized_pickup text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.children enable row level security;

create policy "Parents can manage own children"
  on public.children for all using (auth.uid() = parent_id);
create policy "Admins can view all children"
  on public.children for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- PLANS (weekly booking plans)
-- ============================================================
create table public.plans (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  nights_per_week int not null check (nights_per_week between 1 and 5),
  price_cents int not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  stripe_subscription_id text,
  stripe_price_id text,
  week_start date not null, -- the Monday of the current billing week
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "Parents can view own plans"
  on public.plans for select using (auth.uid() = parent_id);
create policy "Parents can manage own plans"
  on public.plans for all using (auth.uid() = parent_id);
create policy "Admins can manage all plans"
  on public.plans for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- NIGHTLY RESERVATIONS
-- ============================================================
create table public.reservations (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  night_date date not null, -- the calendar date of the overnight (e.g., 2026-03-05 = that evening 9PM-7AM)
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  checked_in boolean not null default false,
  checked_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(child_id, night_date)
);

alter table public.reservations enable row level security;

create policy "Parents can view own reservations"
  on public.reservations for select using (auth.uid() = parent_id);
create policy "Parents can manage own reservations"
  on public.reservations for all using (auth.uid() = parent_id);
create policy "Admins can manage all reservations"
  on public.reservations for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Index for capacity checks
create index idx_reservations_night_date on public.reservations(night_date)
  where status = 'confirmed';

-- ============================================================
-- WAITLIST
-- ============================================================
create table public.waitlist (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  night_date date not null,
  position int not null,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'confirmed', 'expired', 'cancelled')),
  offered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy "Parents can view own waitlist"
  on public.waitlist for select using (auth.uid() = parent_id);
create policy "Admins can manage all waitlist"
  on public.waitlist for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- ADMIN SETTINGS (singleton config)
-- ============================================================
create table public.admin_settings (
  id uuid primary key default uuid_generate_v4(),
  max_capacity int not null default 6,
  operating_nights jsonb not null default '["sunday","monday","tuesday","wednesday","thursday"]',
  pricing_tiers jsonb not null default '[{"nights":1,"price_cents":9500},{"nights":2,"price_cents":18000},{"nights":3,"price_cents":25500},{"nights":4,"price_cents":32000},{"nights":5,"price_cents":37500}]',
  billing_day text not null default 'friday',
  billing_time text not null default '12:00',
  waitlist_confirm_hours int not null default 24,
  overnight_start_time text not null default '21:00',
  overnight_end_time text not null default '07:00',
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

create policy "Anyone can read settings"
  on public.admin_settings for select using (true);
create policy "Admins can update settings"
  on public.admin_settings for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Insert default settings row
insert into public.admin_settings (id) values (uuid_generate_v4());

-- ============================================================
-- PAYMENTS (track Stripe payment events)
-- ============================================================
create table public.payments (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  amount_cents int not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded', 'comped')),
  description text,
  week_start date,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "Parents can view own payments"
  on public.payments for select using (auth.uid() = parent_id);
create policy "Admins can manage all payments"
  on public.payments for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- BILLING EVENTS (immutable webhook audit trail + idempotency)
-- ============================================================
create table public.billing_events (
  id uuid primary key default uuid_generate_v4(),
  stripe_event_id text not null unique,  -- idempotency key
  event_type text not null,
  plan_id uuid references public.plans(id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;

create policy "Admins can view billing events"
  on public.billing_events for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- PENDING PLAN CHANGES (queued tier changes for next billing cycle)
-- ============================================================
create table public.pending_plan_changes (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null unique references public.plans(id) on delete cascade,
  new_nights_per_week int not null check (new_nights_per_week between 1 and 5),
  new_price_cents int not null,
  effective_date date not null,  -- the next Friday when change takes effect
  created_at timestamptz not null default now()
);

alter table public.pending_plan_changes enable row level security;

create policy "Parents can view own pending changes"
  on public.pending_plan_changes for select using (
    exists (
      select 1 from public.plans
      where plans.id = pending_plan_changes.plan_id
        and plans.parent_id = auth.uid()
    )
  );
create policy "Admins can manage pending changes"
  on public.pending_plan_changes for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
