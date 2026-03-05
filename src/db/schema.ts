/**
 * SQLite schema for subscription and billing state.
 *
 * We use SQLite (via better-sqlite3) for simplicity. Swap to Postgres
 * in production by changing the driver — the schema translates directly.
 */
export const SCHEMA = `
-- Parents (lightweight; auth lives elsewhere)
CREATE TABLE IF NOT EXISTS parents (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Subscriptions: one active subscription per parent at a time.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id              TEXT NOT NULL REFERENCES parents(id),
  stripe_subscription_id TEXT UNIQUE,
  plan_tier              TEXT NOT NULL CHECK (plan_tier IN ('plan_1n','plan_2n','plan_3n','plan_4n','plan_5n')),
  status                 TEXT NOT NULL DEFAULT 'incomplete'
                         CHECK (status IN ('active','past_due','canceled','incomplete')),
  next_billing_date      TEXT,  -- ISO-8601 (next Friday noon)
  current_period_end     TEXT,  -- ISO-8601 (Thursday 23:59 end of paid week)
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_parent   ON subscriptions(parent_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe   ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status   ON subscriptions(status);

-- Billing events log: immutable audit trail of every webhook we process.
CREATE TABLE IF NOT EXISTS billing_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT NOT NULL UNIQUE,  -- idempotency key
  event_type      TEXT NOT NULL,
  subscription_id INTEGER REFERENCES subscriptions(id),
  payload         TEXT NOT NULL,  -- full JSON from Stripe
  processed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pending plan changes: queued when a parent changes tier mid-cycle.
-- Applied automatically at the start of the next billing week.
CREATE TABLE IF NOT EXISTS pending_plan_changes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL UNIQUE REFERENCES subscriptions(id),
  new_plan_tier   TEXT NOT NULL CHECK (new_plan_tier IN ('plan_1n','plan_2n','plan_3n','plan_4n','plan_5n')),
  effective_date  TEXT NOT NULL,  -- the next Friday when change takes effect
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
