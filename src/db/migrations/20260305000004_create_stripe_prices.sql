-- Migration 4: stripe_prices cache table + align reservation status constraint
-- Converted from 20260305000004_create_stripe_prices.js for Supabase SQL Editor

-- stripe_prices: caches Stripe Price IDs per plan tier and mode
CREATE TABLE IF NOT EXISTS stripe_prices (
  tier VARCHAR(255) NOT NULL,
  price_id VARCHAR(255) NOT NULL,
  mode VARCHAR(255) NOT NULL DEFAULT 'test',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tier, mode)
);

-- Align reservation status constraint to include "canceled"
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservations_status;
ALTER TABLE reservations
  ADD CONSTRAINT chk_reservations_status
    CHECK (status IN ('pending_payment', 'confirmed', 'locked', 'canceled', 'canceled_low_enrollment'));
