/**
 * Subscription plan tiers. The suffix "N" represents nights per week.
 * e.g. Plan_1N = 1 night/week, Plan_5N = 5 nights/week.
 */
export enum PlanTier {
  Plan_1N = "plan_1n",
  Plan_2N = "plan_2n",
  Plan_3N = "plan_3n",
  Plan_4N = "plan_4n",
  Plan_5N = "plan_5n",
}

/** Weekly price in cents for each tier. */
export const PLAN_PRICES: Record<PlanTier, number> = {
  [PlanTier.Plan_1N]: 9500, // $95
  [PlanTier.Plan_2N]: 18000, // $180
  [PlanTier.Plan_3N]: 25500, // $255
  [PlanTier.Plan_4N]: 32000, // $320
  [PlanTier.Plan_5N]: 37500, // $375
};

/** Human-readable label for each tier. */
export const PLAN_LABELS: Record<PlanTier, string> = {
  [PlanTier.Plan_1N]: "1 Night / Week – $95",
  [PlanTier.Plan_2N]: "2 Nights / Week – $180",
  [PlanTier.Plan_3N]: "3 Nights / Week – $255",
  [PlanTier.Plan_4N]: "4 Nights / Week – $320",
  [PlanTier.Plan_5N]: "5 Nights / Week – $375",
};

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

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
