-- Migration 2: Check constraints, partial unique index, and billing_events table
-- Converted from 20260305000002_add_constraints_and_billing_events.js for Supabase SQL Editor

-- Check constraints on status columns
ALTER TABLE overnight_blocks
  ADD CONSTRAINT chk_blocks_status
    CHECK (status IN ('active', 'cancelled', 'canceled_low_enrollment')),
  ADD CONSTRAINT chk_blocks_payment_status
    CHECK (payment_status IN ('pending', 'confirmed', 'locked'));

ALTER TABLE reservations
  ADD CONSTRAINT chk_reservations_status
    CHECK (status IN ('pending_payment', 'confirmed', 'locked', 'canceled_low_enrollment'));

ALTER TABLE nightly_capacity
  ADD CONSTRAINT chk_nightly_capacity_status
    CHECK (status IN ('open', 'full', 'canceled_low_enrollment', 'canceled_admin'));

ALTER TABLE waitlist
  ADD CONSTRAINT chk_waitlist_status
    CHECK (status IN ('waiting', 'offered', 'accepted', 'expired', 'removed'));

ALTER TABLE credits
  ADD CONSTRAINT chk_credits_reason
    CHECK (reason IN ('canceled_low_enrollment', 'admin_manual', 'refund'));

ALTER TABLE parents
  ADD CONSTRAINT chk_parents_role
    CHECK (role IN ('parent', 'admin'));

ALTER TABLE plans
  ADD CONSTRAINT chk_plans_nights
    CHECK (nights_per_week BETWEEN 1 AND 7);

-- Replace full unique constraint with partial unique index (only non-canceled reservations block double-booking)
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS uniq_reservations_child_date;
CREATE UNIQUE INDEX uniq_reservations_child_date_confirmed
  ON reservations (child_id, date)
  WHERE status NOT IN ('canceled_low_enrollment');

-- billing_events (Stripe webhook idempotency)
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(255) NOT NULL,
  subscription_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
