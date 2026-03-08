export type DayOfWeek = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

// ─── centers ────────────────────────────────────────────────────────────────
export interface Center {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── programs ───────────────────────────────────────────────────────────────
export interface Program {
  id: string;
  center_id: string;
  name: string;
  care_type: 'overnight' | 'daycare' | 'drop_in';
  start_time: string;
  end_time: string;
  age_min_months: number | null;
  age_max_months: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  center?: Center;
}

// ─── program_capacity ───────────────────────────────────────────────────────
export interface ProgramCapacity {
  id: string;
  center_id: string;
  program_id: string;
  care_date: string;
  capacity_total: number;
  capacity_reserved: number;
  capacity_waitlisted: number;
  status: 'open' | 'full' | 'closed';
  created_at: string;
  updated_at: string;
  // Joined
  program?: Program;
}

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address: string | null;
  role: 'parent' | 'admin';
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  allergies: string | null;
  photo_url: string | null;
  medical_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  parent_id: string;
  child_id: string;
  nights_per_week: number;
  price_cents: number;
  status: 'active' | 'paused' | 'cancelled';
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  week_start: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  child?: Child;
  parent?: Profile;
}

export interface Reservation {
  id: string;
  overnight_block_id: string;
  child_id: string;
  date: string;
  status: 'pending_payment' | 'confirmed' | 'locked' | 'cancelled' | 'canceled_low_enrollment';
  admin_override: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  child?: Child;
  overnight_block?: OvernightBlock;
}

export interface OvernightBlock {
  id: string;
  week_start: string;
  parent_id: string;
  child_id: string;
  plan_id: string | null;
  nights_per_week: number;
  weekly_price_cents: number;
  multi_child_discount_pct: number;
  status: 'active' | 'cancelled' | 'canceled_low_enrollment';
  payment_status: 'pending' | 'paid' | 'failed' | 'confirmed' | 'locked';
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  child?: Child;
  parent?: Profile;
}

export interface WaitlistEntry {
  id: string;
  parent_id: string;
  child_id: string;
  date: string;
  status: 'waiting' | 'offered' | 'accepted' | 'expired' | 'removed';
  offered_at: string | null;
  expires_at: string | null;
  created_at: string;
  // Joined fields
  child?: Child;
  parent?: Profile;
}

export interface ReservationNight {
  id: string;
  reservation_id: string;
  child_id: string;
  program_capacity_id: string | null;
  care_date: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'waitlisted' | 'no_show';
  capacity_snapshot: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  child?: Child;
  reservation?: Reservation;
  program_capacity?: ProgramCapacity;
}

export interface PricingTier {
  nights: number;
  price_cents: number;
}

export interface AdminSettings {
  id: string;
  max_capacity: number;
  operating_nights: DayOfWeek[];
  pricing_tiers: PricingTier[];
  billing_day: string;
  billing_time: string;
  waitlist_confirm_hours: number;
  overnight_start_time: string;
  overnight_end_time: string;
  updated_at: string;
}

export interface Credit {
  id: string;
  parent_id: string;
  amount_cents: number;
  reason: 'canceled_low_enrollment' | 'admin_manual' | 'refund';
  related_block_id: string | null;
  related_date: string | null;
  applied: boolean;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  parent_id: string;
  plan_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  amount_cents: number;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'comped';
  description: string | null;
  week_start: string | null;
  created_at: string;
}

// ─── subscriptions (billing-hardened) ────────────────────────────────────────
export interface Subscription {
  id: string;
  parent_id: string;
  stripe_subscription_id: string;
  plan_tier: string;
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  stripe_status: string;
  next_billing_date: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

// ─── pending_plan_changes ────────────────────────────────────────────────────
export interface PendingPlanChange {
  id: string;
  subscription_id: string;
  new_plan_tier: string;
  effective_date: string;
  created_at: string;
  updated_at: string;
}

// ─── billing_events (Stripe webhook idempotency) ────────────────────────────
export interface BillingEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  subscription_id: string | null;
  payload: Record<string, unknown>;
  livemode: boolean;
  stripe_created_at: string | null;
  status: 'received' | 'processed' | 'failed' | 'skipped';
  error: string | null;
  processed_at: string;
}
