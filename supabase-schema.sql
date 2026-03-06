-- ============================================================
-- Overnight Childcare Booking – Postgres Schema
-- ============================================================
-- NOTE: The canonical schema is defined by the Knex migrations in
-- src/db/migrations/. This file is a reference snapshot only.
-- Run `npx knex migrate:latest` to apply the actual schema.
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- PARENTS (the auth user's profile)
-- ============================================================
create table public.parents (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text not null,
  last_name          text not null,
  email              text not null unique,
  phone              text,
  address            text,
  role               text not null default 'parent',
  is_admin           boolean not null default false,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ============================================================
-- CHILDREN (belongs_to parent)
-- ============================================================
create table public.children (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid not null references public.parents(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  date_of_birth     date,
  allergies         text,
  medical_notes     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_children_parent_id on public.children(parent_id);

-- ============================================================
-- CHILD_EMERGENCY_CONTACTS
-- ============================================================
create table public.child_emergency_contacts (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  relationship    text not null,
  phone           text not null,
  phone_alt       text,
  priority        int not null default 1,
  authorized_for_pickup boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (child_id, priority)
);

-- ============================================================
-- CHILD_AUTHORIZED_PICKUPS
-- ============================================================
create table public.child_authorized_pickups (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  relationship    text not null,
  phone           text not null,
  pickup_pin_hash text not null,
  id_verified     boolean not null default false,
  id_verified_at  timestamptz,
  id_verified_by  uuid,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- PLANS (catalog of available subscription tiers)
-- ============================================================
create table public.plans (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  nights_per_week   int not null check (nights_per_week between 1 and 7),
  weekly_price_cents int not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (nights_per_week)
);

-- Seed default plan tiers
insert into public.plans (name, nights_per_week, weekly_price_cents) values
  ('3 nights', 3, 30000),
  ('4 nights', 4, 36000),
  ('5 nights', 5, 42500);

-- ============================================================
-- OVERNIGHT_BLOCKS (per-user weekly booking record)
-- ============================================================
create table public.overnight_blocks (
  id                       uuid primary key default gen_random_uuid(),
  week_start               date not null,
  parent_id                uuid not null references public.parents(id) on delete cascade,
  child_id                 uuid not null references public.children(id) on delete cascade,
  plan_id                  uuid references public.plans(id),
  nights_per_week          int not null,
  weekly_price_cents       int not null,
  multi_child_discount_pct int not null default 0,
  status                   text not null default 'active',
  payment_status           text not null default 'pending',
  stripe_subscription_id   text,
  stripe_invoice_id        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_blocks_week_start on public.overnight_blocks(week_start);
create index idx_blocks_parent_week on public.overnight_blocks(parent_id, week_start);
create index idx_blocks_child_week on public.overnight_blocks(child_id, week_start);

-- ============================================================
-- RESERVATIONS (individual night bookings)
-- ============================================================
create table public.reservations (
  id                  uuid primary key default gen_random_uuid(),
  child_id            uuid not null references public.children(id) on delete cascade,
  date                date not null,
  overnight_block_id  uuid not null references public.overnight_blocks(id) on delete cascade,
  status              text not null default 'confirmed',
  admin_override      boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (child_id, date)
);

create index idx_reservations_date on public.reservations(date);
create index idx_reservations_block on public.reservations(overnight_block_id);

-- ============================================================
-- NIGHTLY_CAPACITY
-- ============================================================
create table public.nightly_capacity (
  date              date primary key,
  capacity          int not null default 6,
  min_enrollment    int not null default 4,
  confirmed_count   int not null default 0,
  status            text not null default 'open',
  override_capacity int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- WAITLIST
-- ============================================================
create table public.waitlist (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null,
  child_id            uuid not null references public.children(id) on delete cascade,
  parent_id           uuid not null references public.parents(id) on delete cascade,
  status              text not null default 'waiting',
  offered_at          timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_waitlist_date_status_created on public.waitlist(date, status, created_at);
create index idx_waitlist_parent on public.waitlist(parent_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  parent_id                uuid not null references public.parents(id) on delete cascade,
  plan_id                  uuid references public.overnight_blocks(id) on delete set null,
  amount_cents             int not null,
  status                   text not null default 'pending',
  description              text,
  stripe_payment_intent_id text,
  stripe_invoice_id        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_payments_parent_id on public.payments(parent_id);
create index idx_payments_status on public.payments(status);

-- ============================================================
-- ADMIN_SETTINGS
-- ============================================================
create table public.admin_settings (
  id                    uuid primary key default gen_random_uuid(),
  max_capacity          int not null default 6,
  min_enrollment        int not null default 4,
  pricing_tiers         jsonb not null default '[{"nights":3,"price_cents":30000},{"nights":4,"price_cents":36000},{"nights":5,"price_cents":42500}]',
  operating_nights      jsonb not null default '["sunday","monday","tuesday","wednesday","thursday"]',
  billing_day           text not null default 'friday',
  billing_time          text not null default '12:00',
  waitlist_confirm_hours int not null default 24,
  overnight_start_time  text not null default '21:00',
  overnight_end_time    text not null default '07:00',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Seed default settings
insert into public.admin_settings (max_capacity, min_enrollment) values (6, 4);

-- ============================================================
-- CREDITS
-- ============================================================
create table public.credits (
  id                       uuid primary key default gen_random_uuid(),
  parent_id                uuid not null references public.parents(id) on delete cascade,
  amount_cents             int not null,
  reason                   text not null,
  related_block_id         uuid references public.overnight_blocks(id) on delete set null,
  related_date             date,
  source_weekly_price_cents int,
  source_plan_nights       int,
  applied                  boolean not null default false,
  applied_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_credits_parent_applied on public.credits(parent_id, applied);
create index idx_credits_related_date on public.credits(related_date);

-- ============================================================
-- AUDIT_LOG
-- ============================================================
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.parents(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index idx_audit_entity on public.audit_log(entity_type, entity_id);
create index idx_audit_created_at on public.audit_log(created_at);

-- ============================================================
-- CONFIG
-- ============================================================
create table public.config (
  key   text primary key,
  value text not null
);

insert into public.config (key, value) values
  ('capacity_per_night', '6'),
  ('min_enrollment_per_night', '4'),
  ('waitlist_offer_ttl_minutes', '120'),
  ('weekly_billing_day', 'friday'),
  ('weekly_billing_hour', '12'),
  ('enrollment_cutoff_hour', '13'),
  ('multi_child_discount_pct', '10');
