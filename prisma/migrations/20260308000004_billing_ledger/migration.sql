-- billing_ledger: canonical per-night billing line items
CREATE TABLE IF NOT EXISTS billing_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  reservation_night_id UUID REFERENCES reservation_nights(id) ON DELETE SET NULL,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'comped')),
  payment_provider TEXT DEFAULT 'stripe',
  stripe_payment_intent_id TEXT,
  description TEXT,
  care_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_ledger_parent ON billing_ledger(parent_id);
CREATE INDEX idx_billing_ledger_status ON billing_ledger(status);
CREATE INDEX idx_billing_ledger_care_date ON billing_ledger(care_date);
CREATE INDEX idx_billing_ledger_night ON billing_ledger(reservation_night_id);
