import { DayOfWeek, PricingTier } from '@/types/database';

export const APP_NAME = 'DreamWatch Overnight';
export const APP_TAGLINE = 'Safe overnight childcare in Georgia';

export const DEFAULT_CAPACITY = 6;

export const DEFAULT_OPERATING_NIGHTS: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
];

export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  { nights: 3, price_cents: 30000 },
  { nights: 4, price_cents: 36000 },
  { nights: 5, price_cents: 42500 },
];

export const MIN_NIGHTS_PER_WEEK = 3;
export const MIN_ENROLLMENT_PER_NIGHT = 4;
export const MULTI_CHILD_DISCOUNT_PCT = 10;

export function creditPerNight(nightsPerWeek: number): number {
  const tier = DEFAULT_PRICING_TIERS.find(t => t.nights === nightsPerWeek);
  if (!tier) return 0;
  return Math.round(tier.price_cents / tier.nights);
}

export const OVERNIGHT_START = '9:00 PM';
export const OVERNIGHT_END = '7:00 AM';

export const DAY_LABELS: Record<DayOfWeek, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

export const DAY_SHORT_LABELS: Record<DayOfWeek, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
};

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function formatCentsDecimal(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function pricePerNight(tier: PricingTier): number {
  return Math.round(tier.price_cents / tier.nights);
}
