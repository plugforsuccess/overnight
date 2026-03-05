-- Migration 1: Initial schema
-- Converted from 20260305000001_initial_schema.js for Supabase SQL Editor

-- parents
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(255),
  address VARCHAR(255),
  role VARCHAR(255) NOT NULL DEFAULT 'parent',
  is_admin BOOLEAN NOT NULL DEFAULT false,
  stripe_customer_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- children
CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  allergies TEXT,
  medical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);

-- plans
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  nights_per_week INTEGER NOT NULL,
  weekly_price_cents INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_plans_nights_per_week UNIQUE (nights_per_week)
);

-- overnight_blocks
CREATE TABLE IF NOT EXISTS overnight_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  nights_per_week INTEGER NOT NULL,
  weekly_price_cents INTEGER NOT NULL,
  multi_child_discount_pct INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(255) NOT NULL DEFAULT 'active',
  payment_status VARCHAR(255) NOT NULL DEFAULT 'pending',
  stripe_subscription_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blocks_week_start ON overnight_blocks(week_start);
CREATE INDEX IF NOT EXISTS idx_blocks_parent_week ON overnight_blocks(parent_id, week_start);
CREATE INDEX IF NOT EXISTS idx_blocks_child_week ON overnight_blocks(child_id, week_start);

-- reservations
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  overnight_block_id UUID NOT NULL REFERENCES overnight_blocks(id) ON DELETE CASCADE,
  status VARCHAR(255) NOT NULL DEFAULT 'confirmed',
  admin_override BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_reservations_child_date UNIQUE (child_id, date)
);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_block ON reservations(overnight_block_id);

-- nightly_capacity
CREATE TABLE IF NOT EXISTS nightly_capacity (
  date DATE PRIMARY KEY,
  capacity INTEGER NOT NULL DEFAULT 6,
  min_enrollment INTEGER NOT NULL DEFAULT 4,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(255) NOT NULL DEFAULT 'open',
  override_capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- waitlist
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  status VARCHAR(255) NOT NULL DEFAULT 'waiting',
  offered_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waitlist_date_status_created ON waitlist(date, status, created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_parent ON waitlist(parent_id);

-- credits
CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  reason VARCHAR(255) NOT NULL,
  related_block_id UUID REFERENCES overnight_blocks(id) ON DELETE SET NULL,
  related_date DATE,
  source_weekly_price_cents INTEGER,
  source_plan_nights INTEGER,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credits_parent_applied ON credits(parent_id, applied);
CREATE INDEX IF NOT EXISTS idx_credits_related_date ON credits(related_date);

-- audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES parents(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255) NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

-- config
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(255) PRIMARY KEY,
  value VARCHAR(255) NOT NULL
);

-- Seed config
INSERT INTO config (key, value) VALUES
  ('capacity_per_night', '6'),
  ('min_enrollment_per_night', '4'),
  ('waitlist_offer_ttl_minutes', '120'),
  ('weekly_billing_day', 'friday'),
  ('weekly_billing_hour', '12'),
  ('enrollment_cutoff_hour', '13'),
  ('multi_child_discount_pct', '10')
ON CONFLICT (key) DO NOTHING;

-- Seed plans
INSERT INTO plans (name, nights_per_week, weekly_price_cents) VALUES
  ('3 nights', 3, 30000),
  ('4 nights', 4, 36000),
  ('5 nights', 5, 42500)
ON CONFLICT (nights_per_week) DO NOTHING;
