-- ============================================================
-- Overnight Childcare Booking – Postgres Schema
-- Canonical identity table: public.parents
-- parents.id = auth.users.id (single canonical identity)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- PARENTS (parents + admins)
-- parents.id is set to auth.users.id — no auto-generated default.
-- ============================================================
create table public.parents (
  id                 uuid primary key,  -- = auth.users.id
  name               text,
  first_name         text not null,
  last_name          text not null,
  email              text not null unique,
  phone              text,
  address            text,
  role               text not null default 'parent'
                     check (role in ('parent', 'admin')),
  is_admin           boolean not null default false,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- FK: parents.id must match an auth.users row
alter table public.parents
  add constraint parents_id_fk_auth_users
  foreign key (id) references auth.users(id) on delete cascade;

-- Auto-create parent row on Supabase signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.parents (id, email, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'parent')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- CHILDREN (belongs_to parent)
-- ============================================================
create table public.children (
  id                       uuid primary key default uuid_generate_v4(),
  parent_id                uuid not null references public.parents(id) on delete cascade,
  name                     text,
  first_name               text not null,
  last_name                text not null,
  date_of_birth            date not null,
  allergies                text,
  medical_notes            text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_children_parent_id on public.children(parent_id);

-- ============================================================
-- PLANS (catalog of available subscription tiers)
-- ============================================================
create table public.plans (
  id                uuid primary key default uuid_generate_v4(),
  name              text,
  plan_key          text unique,                       -- e.g. 'plan_1n', 'plan_2n', …
  nights_per_week   int not null check (nights_per_week between 1 and 5),
  weekly_price_cents int not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uniq_plans_nights_per_week unique (nights_per_week)
);

-- Seed default plan tiers
insert into public.plans (name, plan_key, nights_per_week, weekly_price_cents) values
  ('1 night',  'plan_1n', 1,  9500),
  ('2 nights', 'plan_2n', 2, 18000),
  ('3 nights', 'plan_3n', 3, 25500),
  ('4 nights', 'plan_4n', 4, 32000),
  ('5 nights', 'plan_5n', 5, 37500);

-- ============================================================
-- OVERNIGHT_BLOCKS (weekly booking blocks)
-- ============================================================
create table public.overnight_blocks (
  id                      uuid primary key default uuid_generate_v4(),
  week_start              date not null,
  parent_id               uuid not null references public.parents(id) on delete cascade,
  child_id                uuid not null references public.children(id) on delete cascade,
  plan_id                 uuid not null references public.plans(id),
  nights_per_week         int not null,
  weekly_price_cents      int not null,
  multi_child_discount_pct int not null default 0,
  status                  text not null default 'active',
  payment_status          text not null default 'pending',
  stripe_subscription_id  text,
  stripe_invoice_id       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_blocks_week_start on public.overnight_blocks(week_start);
create index idx_blocks_parent_week on public.overnight_blocks(parent_id, week_start);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
create table public.subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  parent_id                uuid not null references public.parents(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  plan_key                 text references public.plans(plan_key),
  plan_tier                text,
  status                   text not null default 'active'
                           check (status in ('active', 'past_due', 'canceled', 'incomplete', 'paused')),
  stripe_status            text,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  next_billing_date        timestamptz,
  next_bill_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index idx_subscriptions_parent_id on public.subscriptions(parent_id);
create index idx_subscriptions_status on public.subscriptions(status);

-- ============================================================
-- RESERVATIONS (individual night bookings)
-- ============================================================
create table public.reservations (
  id                  uuid primary key default uuid_generate_v4(),
  child_id            uuid not null references public.children(id) on delete cascade,
  date                date not null,
  overnight_block_id  uuid references public.overnight_blocks(id) on delete cascade,
  status              text not null default 'confirmed'
                      check (status in ('confirmed', 'cancelled', 'completed')),
  admin_override      boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uniq_reservations_child_date unique (child_id, date)
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
  id                  uuid primary key default uuid_generate_v4(),
  date                date not null,
  child_id            uuid not null references public.children(id) on delete cascade,
  parent_id           uuid not null references public.parents(id) on delete cascade,
  status              text not null default 'waiting'
                      check (status in ('waiting', 'offered', 'confirmed', 'expired', 'cancelled')),
  offered_at          timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_waitlist_date_status_created
  on public.waitlist(date, status, created_at);
create index idx_waitlist_parent on public.waitlist(parent_id);

-- ============================================================
-- CREDITS
-- ============================================================
create table public.credits (
  id                      uuid primary key default uuid_generate_v4(),
  parent_id               uuid not null references public.parents(id) on delete cascade,
  amount_cents            int not null,
  reason                  text not null,
  related_block_id        uuid references public.overnight_blocks(id) on delete set null,
  related_date            date,
  source_weekly_price_cents int,
  source_plan_nights      int,
  applied                 boolean not null default false,
  applied_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_credits_parent_applied on public.credits(parent_id, applied);

-- ============================================================
-- AUDIT_LOG
-- ============================================================
create table public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.parents(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb default '{}',
  created_at  timestamptz not null default now()
);

create index idx_audit_log_actor   on public.audit_log(actor_id);
create index idx_audit_log_entity  on public.audit_log(entity_type, entity_id);
create index idx_audit_log_created on public.audit_log(created_at);

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
  ('multi_child_discount_pct', '10')
on conflict (key) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Parents
alter table public.parents enable row level security;

create policy parents_select_own
  on public.parents for select to authenticated
  using (id = auth.uid());
create policy parents_insert_own
  on public.parents for insert to authenticated
  with check (id = auth.uid());
create policy parents_update_own
  on public.parents for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
create policy "Admins can view all parents"
  on public.parents for select using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Children
alter table public.children enable row level security;

create policy children_select_own
  on public.children for select to authenticated
  using (parent_id = auth.uid());
create policy children_insert_own
  on public.children for insert to authenticated
  with check (parent_id = auth.uid());
create policy children_update_own
  on public.children for update to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());
create policy children_delete_own
  on public.children for delete to authenticated
  using (parent_id = auth.uid());
create policy "Admins can view all children"
  on public.children for select using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Plans (readable by everyone)
alter table public.plans enable row level security;

create policy "Anyone can read plans"
  on public.plans for select using (true);
create policy "Admins can manage plans"
  on public.plans for all using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Overnight Blocks
alter table public.overnight_blocks enable row level security;

create policy overnight_blocks_select_own
  on public.overnight_blocks for select to authenticated
  using (parent_id = auth.uid());
create policy overnight_blocks_update_own
  on public.overnight_blocks for update to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

-- Subscriptions
alter table public.subscriptions enable row level security;

create policy "Parents can view own subscriptions"
  on public.subscriptions for select using (auth.uid() = parent_id);
create policy "Admins can manage all subscriptions"
  on public.subscriptions for all using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Reservations
alter table public.reservations enable row level security;

create policy reservations_select_own
  on public.reservations for select to authenticated
  using (
    overnight_block_id in (
      select ob.id from public.overnight_blocks ob
      where ob.parent_id = auth.uid()
    )
  );
create policy "Admins can manage all reservations"
  on public.reservations for all using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Nightly Capacity
alter table public.nightly_capacity enable row level security;

create policy "Anyone can read nightly_capacity"
  on public.nightly_capacity for select using (true);
create policy "Admins can manage nightly_capacity"
  on public.nightly_capacity for all using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Waitlist
alter table public.waitlist enable row level security;

create policy waitlist_select_own
  on public.waitlist for select to authenticated
  using (parent_id = auth.uid());
create policy "Admins can manage all waitlist entries"
  on public.waitlist for all using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );

-- Audit Log (admin-only)
alter table public.audit_log enable row level security;

create policy "Admins can view audit_log"
  on public.audit_log for select using (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
  );
create policy "Admins can insert audit_log"
  on public.audit_log for insert with check (
    exists (select 1 from public.parents where id = auth.uid() and role = 'admin')
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

create trigger set_updated_at before update on public.parents
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.children
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.overnight_blocks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.nightly_capacity
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.waitlist
  for each row execute function public.set_updated_at();
