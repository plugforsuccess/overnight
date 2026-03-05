-- ============================================================
-- Overnight Childcare Booking – Postgres Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS (parents + admins)
-- ============================================================
create table public.users (
  id                 uuid primary key default uuid_generate_v4(),
  email              text not null unique,
  full_name          text not null,
  phone              text,
  role               text not null default 'parent'
                     check (role in ('parent', 'admin')),
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Auto-create user row on Supabase signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, role)
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
-- CHILDREN (belongs_to user)
-- ============================================================
create table public.children (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references public.users(id) on delete cascade,
  full_name                text not null,
  date_of_birth            date not null,
  allergies                text,
  medical_notes            text,
  emergency_contact_name   text not null,
  emergency_contact_phone  text not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_children_user_id on public.children(user_id);

-- ============================================================
-- PLANS (catalog of available subscription tiers)
-- ============================================================
create table public.plans (
  id                uuid primary key default uuid_generate_v4(),
  plan_key          text not null unique,         -- e.g. 'plan_1n', 'plan_2n', …
  nights_per_week   int not null check (nights_per_week between 1 and 5),
  weekly_price_cents int not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Seed default plan tiers
insert into public.plans (plan_key, nights_per_week, weekly_price_cents) values
  ('plan_1n', 1,  9500),
  ('plan_2n', 2, 18000),
  ('plan_3n', 3, 25500),
  ('plan_4n', 4, 32000),
  ('plan_5n', 5, 37500);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
create table public.subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references public.users(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  plan_key                 text not null references public.plans(plan_key),
  status                   text not null default 'active'
                           check (status in ('active', 'past_due', 'canceled', 'incomplete', 'paused')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  next_bill_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_status  on public.subscriptions(status);

-- ============================================================
-- RESERVATION_WEEKS (one row per user per booking week)
-- ============================================================
create table public.reservation_weeks (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  week_start_date date not null,                  -- Monday of the week
  plan_key        text not null references public.plans(plan_key),
  status          text not null default 'active'
                  check (status in ('active', 'cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index idx_reservation_weeks_user_id on public.reservation_weeks(user_id);

-- ============================================================
-- RESERVATIONS (individual night bookings)
-- ============================================================
create table public.reservations (
  id                  uuid primary key default uuid_generate_v4(),
  reservation_week_id uuid not null references public.reservation_weeks(id) on delete cascade,
  child_id            uuid not null references public.children(id) on delete cascade,
  date                date not null,
  status              text not null default 'confirmed'
                      check (status in ('confirmed', 'cancelled', 'completed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Prevent double-booking a child on the same night
create unique index idx_reservations_child_date
  on public.reservations(child_id, date)
  where status = 'confirmed';

-- Fast capacity lookups by date
create index idx_reservations_date
  on public.reservations(date)
  where status = 'confirmed';

-- ============================================================
-- NIGHT_CAPACITY
-- Configurable per-night capacity. reserved_count is computed
-- via query against reservations + idx_reservations_date.
-- ============================================================
create table public.night_capacity (
  date       date primary key,
  capacity   int not null default 6,
  updated_at timestamptz not null default now()
);

-- Helper view: reserved count per night (confirmed only)
create or replace view public.night_availability as
select
  nc.date,
  nc.capacity,
  coalesce(r.reserved_count, 0) as reserved_count,
  nc.capacity - coalesce(r.reserved_count, 0) as spots_available
from public.night_capacity nc
left join (
  select date, count(*) as reserved_count
  from public.reservations
  where status = 'confirmed'
  group by date
) r on r.date = nc.date;

-- ============================================================
-- WAITLIST
-- ============================================================
create table public.waitlist (
  id                  uuid primary key default uuid_generate_v4(),
  date                date not null,
  child_id            uuid not null references public.children(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  status              text not null default 'waiting'
                      check (status in ('waiting', 'offered', 'confirmed', 'expired', 'cancelled')),
  offered_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- FIFO ordering: date + created_at
create index idx_waitlist_date_created
  on public.waitlist(date, created_at)
  where status = 'waiting';

-- ============================================================
-- AUDIT_LOG (admin overrides, cancellations, swaps)
-- ============================================================
create table public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid not null references public.users(id),
  action      text not null,                     -- e.g. 'admin_override', 'cancel', 'swap', 'waitlist_promote'
  entity_type text not null,                     -- e.g. 'reservation', 'subscription', 'waitlist'
  entity_id   uuid,
  metadata    jsonb default '{}',                -- additional context
  created_at  timestamptz not null default now()
);

create index idx_audit_log_actor   on public.audit_log(actor_id);
create index idx_audit_log_entity  on public.audit_log(entity_type, entity_id);
create index idx_audit_log_created on public.audit_log(created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Users
alter table public.users enable row level security;

create policy "Users can view own row"
  on public.users for select using (auth.uid() = id);
create policy "Users can update own row"
  on public.users for update using (auth.uid() = id);
create policy "Admins can view all users"
  on public.users for select using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Children
alter table public.children enable row level security;

create policy "Parents can manage own children"
  on public.children for all using (auth.uid() = user_id);
create policy "Admins can view all children"
  on public.children for select using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Plans (readable by everyone)
alter table public.plans enable row level security;

create policy "Anyone can read plans"
  on public.plans for select using (true);
create policy "Admins can manage plans"
  on public.plans for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Subscriptions
alter table public.subscriptions enable row level security;

create policy "Users can view own subscriptions"
  on public.subscriptions for select using (auth.uid() = user_id);
create policy "Admins can manage all subscriptions"
  on public.subscriptions for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Reservation Weeks
alter table public.reservation_weeks enable row level security;

create policy "Users can view own reservation_weeks"
  on public.reservation_weeks for select using (auth.uid() = user_id);
create policy "Users can manage own reservation_weeks"
  on public.reservation_weeks for all using (auth.uid() = user_id);
create policy "Admins can manage all reservation_weeks"
  on public.reservation_weeks for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Reservations
alter table public.reservations enable row level security;

create policy "Users can view own reservations"
  on public.reservations for select using (
    exists (
      select 1 from public.reservation_weeks rw
      where rw.id = reservation_week_id and rw.user_id = auth.uid()
    )
  );
create policy "Admins can manage all reservations"
  on public.reservations for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Night Capacity
alter table public.night_capacity enable row level security;

create policy "Anyone can read night_capacity"
  on public.night_capacity for select using (true);
create policy "Admins can manage night_capacity"
  on public.night_capacity for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Waitlist
alter table public.waitlist enable row level security;

create policy "Users can view own waitlist entries"
  on public.waitlist for select using (auth.uid() = user_id);
create policy "Admins can manage all waitlist entries"
  on public.waitlist for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- Audit Log (admin-only)
alter table public.audit_log enable row level security;

create policy "Admins can view audit_log"
  on public.audit_log for select using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
create policy "Admins can insert audit_log"
  on public.audit_log for insert with check (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- ============================================================
-- UPDATED_AT TRIGGER (auto-set updated_at on row change)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.children
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reservation_weeks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.night_capacity
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.waitlist
  for each row execute function public.set_updated_at();
