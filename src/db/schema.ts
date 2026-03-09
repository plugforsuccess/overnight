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
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  role: string;
  /** @deprecated Use role === 'admin' instead. Column will be dropped in a future migration. */
  is_admin: boolean;
  stripe_customer_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── children ─────────────────────────────────────────────────────────────────
export interface Child {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  photo_url: string | null;
  medical_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── child_allergies ─────────────────────────────────────────────────────────
export interface ChildAllergy {
  id: string;
  child_id: string;
  allergen: string;
  custom_label: string | null;
  severity: string;
  created_at: Date;
  updated_at: Date;
}

// ─── child_allergy_action_plans ──────────────────────────────────────────────
export interface ChildAllergyActionPlan {
  id: string;
  child_allergy_id: string;
  treatment_first_line: string;
  dose_instructions: string | null;
  symptoms_watch: unknown;
  med_location: string | null;
  requires_med_on_site: boolean;
  medication_expires_on: string | null;
  physician_name: string | null;
  parent_confirmed: boolean;
  parent_confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── child_emergency_contacts ────────────────────────────────────────────────
export interface ChildEmergencyContact {
  id: string;
  child_id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  phone_alt: string | null;
  priority: number;
  authorized_for_pickup: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── child_authorized_pickups ────────────────────────────────────────────────
export interface ChildAuthorizedPickup {
  id: string;
  child_id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  pickup_pin_hash: string;
  id_verified: boolean;
  id_verified_at: Date | null;
  id_verified_by: string | null;
  notes: string | null;
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
  status: 'pending_payment' | 'confirmed' | 'locked' | 'canceled' | 'canceled_low_enrollment';
  admin_override: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── stripe_prices ───────────────────────────────────────────────────────────
export interface StripePriceCache {
  tier: string;
  price_id: string;
  mode: 'test' | 'live';
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
// ─── subscriptions ───────────────────────────────────────────────────────────
export interface Subscription {
  id: string;
  parent_id: string;
  stripe_subscription_id: string;
  plan_tier: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  stripe_status: string;
  next_billing_date: Date | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── pending_plan_changes ────────────────────────────────────────────────────
export interface PendingPlanChange {
  id: string;
  subscription_id: string;
  new_plan_tier: string;
  effective_date: Date;
  created_at: Date;
  updated_at: Date;
}

// ─── billing_events ──────────────────────────────────────────────────────────
export interface BillingEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  subscription_id: string | null;
  payload: Record<string, unknown>;
  livemode: boolean;
  stripe_created_at: Date | null;
  status: 'received' | 'processed' | 'failed' | 'skipped';
  error: string | null;
  processed_at: Date;
}

// ─── Knex table-name → row-type mapping (for knex<TableType>('table')) ───────
export interface Tables {
  parents: Parent;
  children: Child;
  child_allergies: ChildAllergy;
  child_allergy_action_plans: ChildAllergyActionPlan;
  child_emergency_contacts: ChildEmergencyContact;
  child_authorized_pickups: ChildAuthorizedPickup;
  plans: Plan;
  overnight_blocks: OvernightBlock;
  reservations: Reservation;
  nightly_capacity: NightlyCapacity;
  waitlist: WaitlistEntry;
  credits: Credit;
  stripe_prices: StripePriceCache;
  audit_log: AuditLogEntry;
  config: ConfigRow;
  subscriptions: Subscription;
  pending_plan_changes: PendingPlanChange;
  billing_events: BillingEvent;
}
