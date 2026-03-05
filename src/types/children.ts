// ─── Enumerations ────────────────────────────────────────────────────────────

export const ALLERGY_TYPES = [
  'PEANUT', 'TREE_NUT', 'MILK', 'EGG', 'WHEAT', 'SOY', 'FISH', 'SHELLFISH',
  'SESAME', 'PENICILLIN', 'INSECT_STING', 'LATEX', 'ASTHMA', 'ENVIRONMENTAL', 'OTHER',
] as const;
export type AllergyType = typeof ALLERGY_TYPES[number];

export const ALLERGY_TYPE_LABELS: Record<AllergyType, string> = {
  PEANUT: 'Peanut',
  TREE_NUT: 'Tree Nut',
  MILK: 'Milk',
  EGG: 'Egg',
  WHEAT: 'Wheat',
  SOY: 'Soy',
  FISH: 'Fish',
  SHELLFISH: 'Shellfish',
  SESAME: 'Sesame',
  PENICILLIN: 'Penicillin',
  INSECT_STING: 'Insect Sting',
  LATEX: 'Latex',
  ASTHMA: 'Asthma',
  ENVIRONMENTAL: 'Environmental',
  OTHER: 'Other',
};

export const ALLERGY_SEVERITIES = ['UNKNOWN', 'MILD', 'MODERATE', 'SEVERE'] as const;
export type AllergySeverity = typeof ALLERGY_SEVERITIES[number];

export const SEVERITY_LABELS: Record<AllergySeverity, string> = {
  UNKNOWN: 'Unknown',
  MILD: 'Mild',
  MODERATE: 'Moderate',
  SEVERE: 'Severe',
};

export const TREATMENT_TYPES = [
  'NONE', 'ANTIHISTAMINE', 'EPINEPHRINE_AUTOINJECTOR', 'INHALER', 'CALL_911', 'OTHER',
] as const;
export type TreatmentType = typeof TREATMENT_TYPES[number];

export const TREATMENT_LABELS: Record<TreatmentType, string> = {
  NONE: 'None',
  ANTIHISTAMINE: 'Antihistamine',
  EPINEPHRINE_AUTOINJECTOR: 'Epinephrine Auto-Injector (EpiPen)',
  INHALER: 'Inhaler',
  CALL_911: 'Call 911',
  OTHER: 'Other',
};

// ─── Database row types ──────────────────────────────────────────────────────

export interface ChildRow {
  id: string;
  parent_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  photo_url: string | null;
  medical_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildAllergyRow {
  id: string;
  child_id: string;
  allergen: AllergyType;
  custom_label: string | null;
  severity: AllergySeverity;
  created_at: string;
  updated_at: string;
  action_plan?: ChildAllergyActionPlanRow | null;
}

export interface ChildAllergyActionPlanRow {
  id: string;
  child_allergy_id: string;
  treatment_first_line: TreatmentType;
  dose_instructions: string | null;
  symptoms_watch: string[] | null;
  med_location: string | null;
  requires_med_on_site: boolean;
  medication_expires_on: string | null;
  physician_name: string | null;
  parent_confirmed: boolean;
  parent_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildEmergencyContactRow {
  id: string;
  child_id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  phone_alt: string | null;
  priority: number;
  authorized_for_pickup: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChildAuthorizedPickupRow {
  id: string;
  child_id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  pickup_pin_hash: string;
  id_verified: boolean;
  id_verified_at: string | null;
  id_verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Full child with nested data (for UI) ────────────────────────────────────

export interface ChildWithDetails extends ChildRow {
  allergies: ChildAllergyRow[];
  emergency_contacts: ChildEmergencyContactRow[];
  authorized_pickups: Omit<ChildAuthorizedPickupRow, 'pickup_pin_hash'>[];
}
