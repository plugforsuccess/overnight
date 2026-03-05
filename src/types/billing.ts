/**
 * Subscription plan tiers. Minimum plan is 3 nights/week per PRD.
 */
export enum PlanTier {
  Plan_3N = "plan_3n",
  Plan_4N = "plan_4n",
  Plan_5N = "plan_5n",
}

/** Weekly price in cents for each tier. */
export const PLAN_PRICES: Record<PlanTier, number> = {
  [PlanTier.Plan_3N]: 30000, // $300
  [PlanTier.Plan_4N]: 36000, // $360
  [PlanTier.Plan_5N]: 42500, // $425
};

/** Number of nights per tier. */
export const PLAN_NIGHTS: Record<PlanTier, number> = {
  [PlanTier.Plan_3N]: 3,
  [PlanTier.Plan_4N]: 4,
  [PlanTier.Plan_5N]: 5,
};

/** Credit per canceled night in cents (weekly_price / nights). */
export const PLAN_CREDIT_PER_NIGHT: Record<PlanTier, number> = {
  [PlanTier.Plan_3N]: 10000, // $100
  [PlanTier.Plan_4N]: 9000,  // $90
  [PlanTier.Plan_5N]: 8500,  // $85
};

/** Human-readable label for each tier. */
export const PLAN_LABELS: Record<PlanTier, string> = {
  [PlanTier.Plan_3N]: "3 Nights / Week – $300",
  [PlanTier.Plan_4N]: "4 Nights / Week – $360",
  [PlanTier.Plan_5N]: "5 Nights / Week – $425",
};

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type ReservationStatus =
  | "pending_payment"
  | "confirmed"
  | "locked"
  | "canceled_low_enrollment";

export interface ParentSubscription {
  id: number;
  parent_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan_tier: PlanTier;
  status: SubscriptionStatus;
  /** ISO-8601 date of the next billing cycle (Friday). */
  next_billing_date: string;
  /** ISO-8601 date the current paid week ends (Thursday 23:59). */
  current_period_end: string;
  created_at: string;
  updated_at: string;
}
