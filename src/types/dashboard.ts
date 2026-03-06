// Types for the redesigned parent dashboard

export interface DashboardAllergyInfo {
  id: string;
  display_name: string;
  severity: string;
  has_treatment: boolean;
}

export interface DashboardChild {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  has_medical_notes: boolean;
  allergies: DashboardAllergyInfo[];
  emergency_contacts_count: number;
  authorized_pickups_count: number;
}

export interface DashboardNextReservation {
  id: string;
  date: string;
  status: string;
  child_first_name: string;
  child_last_name: string;
}

export interface DashboardSubscription {
  id: string;
  plan_tier: string;
  status: string;
  next_billing_date: string | null;
}

export interface DashboardData {
  profile: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    stripe_customer_id: string | null;
    last_login?: string;
  };
  children: DashboardChild[];
  nextReservation: DashboardNextReservation | null;
  subscriptions: DashboardSubscription[];
  weeklyTotalCents: number;
  upcomingReservationsCount: number;
  waitlistCount: number;
}
