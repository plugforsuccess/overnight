/**
 * SQLite schema for local dev / billing state.
 *
 * Mirrors the Postgres schema in supabase-schema.sql.
 * Uses SQLite (via better-sqlite3) for simplicity in dev/test.
 */
export const SCHEMA = `
-- Users (parents + admins)
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  full_name          TEXT NOT NULL,
  phone              TEXT,
  role               TEXT NOT NULL DEFAULT 'parent'
                     CHECK (role IN ('parent', 'admin')),
  stripe_customer_id TEXT UNIQUE,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Children (belongs_to user)
CREATE TABLE IF NOT EXISTS children (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name               TEXT NOT NULL,
  date_of_birth           TEXT NOT NULL,
  allergies               TEXT,
  medical_notes           TEXT,
  emergency_contact_name  TEXT NOT NULL,
  emergency_contact_phone TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_children_user_id ON children(user_id);

-- Plans (catalog of subscription tiers)
CREATE TABLE IF NOT EXISTS plans (
  id                 TEXT PRIMARY KEY,
  plan_key           TEXT NOT NULL UNIQUE,
  nights_per_week    INTEGER NOT NULL CHECK (nights_per_week BETWEEN 1 AND 5),
  weekly_price_cents INTEGER NOT NULL,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT UNIQUE,
  plan_key                 TEXT NOT NULL REFERENCES plans(plan_key),
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','past_due','canceled','incomplete','paused')),
  current_period_start     TEXT,
  current_period_end       TEXT,
  next_bill_at             TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);

-- Reservation Weeks (one row per user per booking week)
CREATE TABLE IF NOT EXISTS reservation_weeks (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start_date TEXT NOT NULL,
  plan_key        TEXT NOT NULL REFERENCES plans(plan_key),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'cancelled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_reservation_weeks_user_id ON reservation_weeks(user_id);

-- Reservations (individual night bookings)
CREATE TABLE IF NOT EXISTS reservations (
  id                  TEXT PRIMARY KEY,
  reservation_week_id TEXT NOT NULL REFERENCES reservation_weeks(id) ON DELETE CASCADE,
  child_id            TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  date                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (child_id, date)
);

CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);

-- Night Capacity
CREATE TABLE IF NOT EXISTS night_capacity (
  date       TEXT PRIMARY KEY,
  capacity   INTEGER NOT NULL DEFAULT 6,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Waitlist
CREATE TABLE IF NOT EXISTS waitlist (
  id                 TEXT PRIMARY KEY,
  date               TEXT NOT NULL,
  child_id           TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting', 'offered', 'confirmed', 'expired', 'cancelled')),
  offered_expires_at TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_date_created ON waitlist(date, created_at);

-- Audit Log (admin overrides, cancellations, swaps)
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  metadata    TEXT DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Billing events log (Stripe webhook idempotency)
CREATE TABLE IF NOT EXISTS billing_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  subscription_id TEXT REFERENCES subscriptions(id),
  payload         TEXT NOT NULL,
  processed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
