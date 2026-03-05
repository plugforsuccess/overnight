/**
 * TypeScript type definitions for the Postgres database schema.
 *
 * @deprecated DDL is no longer defined here. All schema changes MUST go through
 *   Knex migrations in src/db/migrations/.
 *
 * These types mirror the tables created by the migration files and are intended
 * for use in application code (services, routes, etc.) when raw Knex results
 * need type annotations.
 */

// ─── parents ──────────────────────────────────────────────────────────────────
export interface Parent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role: string;
  is_admin: boolean;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── children ─────────────────────────────────────────────────────────────────
export interface Child {
  id: string;
  parent_id: string;
  name: string;
  date_of_birth: string | null;
  allergies: string | null;
  medical_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── plans ────────────────────────────────────────────────────────────────────
export interface Plan {
  id: string;
  name: string;
  nights_per_week: number;
  weekly_price_cents: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── overnight_blocks ─────────────────────────────────────────────────────────
export interface OvernightBlock {
  id: string;
  week_start: string;
  parent_id: string;
  child_id: string;
  plan_id: string;
  nights_per_week: number;
  weekly_price_cents: number;
  multi_child_discount_pct: number;
  status: 'active' | 'cancelled' | 'canceled_low_enrollment';
  payment_status: 'pending' | 'confirmed' | 'locked';
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── reservations ─────────────────────────────────────────────────────────────
export interface Reservation {
  id: string;
  child_id: string;
  date: string;
  overnight_block_id: string;
  status: 'pending_payment' | 'confirmed' | 'locked' | 'canceled_low_enrollment';
  admin_override: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── nightly_capacity ─────────────────────────────────────────────────────────
export interface NightlyCapacity {
  date: string;
  capacity: number;
  min_enrollment: number;
  confirmed_count: number;
  status: 'open' | 'full' | 'canceled_low_enrollment' | 'canceled_admin';
  override_capacity: number | null;
  created_at: Date;
  updated_at: Date;
}

// ─── waitlist ─────────────────────────────────────────────────────────────────
export interface WaitlistEntry {
  id: string;
  date: string;
  child_id: string;
  parent_id: string;
  status: 'waiting' | 'offered' | 'accepted' | 'expired' | 'removed';
  offered_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── credits ──────────────────────────────────────────────────────────────────
export interface Credit {
  id: string;
  parent_id: string;
  amount_cents: number;
  reason: 'canceled_low_enrollment' | 'admin_manual' | 'refund';
  related_block_id: string | null;
  related_date: string | null;
  source_weekly_price_cents: number | null;
  source_plan_nights: number | null;
  applied: boolean;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── audit_log ────────────────────────────────────────────────────────────────
export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ─── config ───────────────────────────────────────────────────────────────────
export interface ConfigRow {
  key: string;
  value: string;
}

// ─── Knex table-name → row-type mapping (for knex<TableType>('table')) ───────
export interface Tables {
  parents: Parent;
  children: Child;
  plans: Plan;
  overnight_blocks: OvernightBlock;
  reservations: Reservation;
  nightly_capacity: NightlyCapacity;
  waitlist: WaitlistEntry;
  credits: Credit;
  audit_log: AuditLogEntry;
  config: ConfigRow;
}
