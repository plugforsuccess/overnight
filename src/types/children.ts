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
  middle_name: string | null;
  preferred_name: string | null;
  date_of_birth: string;
  gender: string | null;
  photo_url: string | null;
  medical_notes: string | null;
  notes: string | null;
  active: boolean;
  archived_at: string | null;
  center_id: string | null;
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
  center_id: string | null;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  phone_alt: string | null;
  email: string | null;
  is_primary: boolean;
  priority: number;
  authorized_for_pickup: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildAuthorizedPickupRow {
  id: string;
  child_id: string;
  center_id: string | null;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  email: string | null;
  dob: string | null;
  pickup_pin_hash: string | null;
  photo_id_url: string | null;
  is_emergency_contact: boolean;
  is_active: boolean;
  archived_at: string | null;
  id_verified: boolean;
  id_verified_at: string | null;
  id_verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChildMedicalProfileRow {
  id: string;
  child_id: string;
  center_id: string | null;
  has_allergies: boolean;
  has_medications: boolean;
  has_medical_conditions: boolean;
  allergies_summary: string | null;
  medications_summary: string | null;
  medical_conditions_summary: string | null;
  physician_name: string | null;
  physician_phone: string | null;
  hospital_preference: string | null;
  special_instructions: string | null;
  created_at: string;
  updated_at: string;
}

export const ONBOARDING_STATUSES = [
  'started',
  'parent_profile_complete',
  'child_created',
  'medical_ack_complete',
  'emergency_contact_added',
  'complete',
] as const;
export type OnboardingStatus = typeof ONBOARDING_STATUSES[number];

// ─── Child Event (append-only safety ledger) ─────────────────────────────────

export const CHILD_EVENT_TYPES = [
  'child_checked_in',
  'child_checked_out',
  'authorized_pickup_verified',
  'medical_alert_triggered',
  'incident_reported',
  'emergency_contact_called',
] as const;
export type ChildEventType = typeof CHILD_EVENT_TYPES[number];

export interface ChildEventRow {
  id: string;
  child_id: string;
  center_id: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// ─── Attendance Session ──────────────────────────────────────────────────────

export const ATTENDANCE_STATUSES = [
  'scheduled',
  'checked_in',
  'in_care',
  'ready_for_pickup',
  'checked_out',
  'cancelled',
] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

export interface ChildAttendanceSessionRow {
  id: string;
  child_id: string;
  center_id: string | null;
  reservation_id: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  checked_in_by: string | null;
  checked_out_by: string | null;
  pickup_person_name: string | null;
  pickup_relationship: string | null;
  pickup_verified: boolean;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Reservation Event (append-only ledger) ──────────────────────────────────

export const RESERVATION_EVENT_TYPES = [
  'reservation_created',
  'reservation_confirmed',
  'reservation_cancelled',
  'reservation_modified',
  'waitlist_promoted',
  'payment_received',
  'no_show',
] as const;
export type ReservationEventType = typeof RESERVATION_EVENT_TYPES[number];

export interface ReservationEventRow {
  id: string;
  reservation_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// ─── Incident Report ─────────────────────────────────────────────────────────

export const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type IncidentSeverity = typeof INCIDENT_SEVERITIES[number];

export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const;
export type IncidentStatus = typeof INCIDENT_STATUSES[number];

export interface IncidentReportRow {
  id: string;
  child_id: string;
  attendance_session_id: string | null;
  center_id: string | null;
  severity: string;
  category: string;
  summary: string;
  details: string | null;
  reported_by: string | null;
  parent_notified_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── Center Staff Membership ─────────────────────────────────────────────────

export const STAFF_ROLES = ['staff', 'admin', 'center_admin', 'super_admin'] as const;
export type StaffRole = typeof STAFF_ROLES[number];

export interface CenterStaffMembershipRow {
  id: string;
  user_id: string;
  center_id: string;
  role: string;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Pickup Verification ─────────────────────────────────────────────────────

export const VERIFICATION_METHODS = ['photo_id', 'pin', 'facial_recognition', 'known_person'] as const;
export type VerificationMethod = typeof VERIFICATION_METHODS[number];

export interface PickupVerificationRow {
  id: string;
  attendance_session_id: string;
  authorized_pickup_id: string | null;
  verified_name: string;
  verified_relationship: string;
  verification_method: string;
  verified_by: string | null;
  verified_at: string;
  notes: string | null;
  created_at: string;
}

// ─── Incident Status Transition Map ──────────────────────────────────────────

export const VALID_INCIDENT_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating', 'resolved', 'closed'],
  investigating: ['resolved', 'closed'],
  resolved: ['closed'],
  closed: [],
};

// ─── Attendance Transition Map ───────────────────────────────────────────────

export const VALID_ATTENDANCE_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['checked_in', 'cancelled'],
  checked_in: ['in_care', 'cancelled'],
  in_care: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['checked_out', 'cancelled'],
  checked_out: [],
  cancelled: [],
};

// ─── Immunization Record ──────────────────────────────────────────────────────

export const IMMUNIZATION_STATUSES = ['current', 'expired', 'exempt_medical', 'exempt_religious', 'missing'] as const;
export type ImmunizationStatus = typeof IMMUNIZATION_STATUSES[number];

export const IMMUNIZATION_STATUS_LABELS: Record<ImmunizationStatus, string> = {
  current: 'Current',
  expired: 'Expired',
  exempt_medical: 'Exempt (Medical)',
  exempt_religious: 'Exempt (Religious)',
  missing: 'Missing',
};

export interface ChildImmunizationRecordRow {
  id: string;
  child_id: string;
  center_id: string | null;
  status: ImmunizationStatus;
  document_url: string | null;
  document_path: string | null;
  issued_date: string | null;
  expires_at: string | null;
  exemption_reason: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Medication Authorization ─────────────────────────────────────────────────

export const MEDICATION_ROUTES = ['oral', 'topical', 'inhaled', 'injection', 'other'] as const;
export type MedicationRoute = typeof MEDICATION_ROUTES[number];

export const MEDICATION_ROUTE_LABELS: Record<MedicationRoute, string> = {
  oral: 'Oral',
  topical: 'Topical',
  inhaled: 'Inhaled',
  injection: 'Injection',
  other: 'Other',
};

export interface MedicationAuthorizationRow {
  id: string;
  child_id: string;
  center_id: string | null;
  medication_name: string;
  dosage: string;
  route: MedicationRoute;
  frequency: string;
  start_date: string;
  end_date: string | null;
  special_instructions: string | null;
  prescribing_physician: string | null;
  parent_consent_name: string | null;
  parent_consent_signed_at: string | null;
  document_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Child Document ───────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = ['immunization_certificate', 'medication_authorization', 'photo_id', 'consent_form', 'physician_note', 'incident_attachment', 'other'] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  immunization_certificate: 'Immunization Certificate',
  medication_authorization: 'Medication Authorization',
  photo_id: 'Photo ID',
  consent_form: 'Consent Form',
  physician_note: 'Physician Note',
  incident_attachment: 'Incident Attachment',
  other: 'Other',
};

export interface ChildDocumentRow {
  id: string;
  child_id: string;
  center_id: string | null;
  document_type: DocumentType;
  file_name: string;
  file_url: string;
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  expires_at: string | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Full child with nested data (for UI) ────────────────────────────────────

export interface ChildWithDetails extends ChildRow {
  allergies: ChildAllergyRow[];
  emergency_contacts: ChildEmergencyContactRow[];
  authorized_pickups: Omit<ChildAuthorizedPickupRow, 'pickup_pin_hash'>[];
  medical_profile: ChildMedicalProfileRow | null;
  immunization_record: ChildImmunizationRecordRow | null;
  medication_authorizations: MedicationAuthorizationRow[];
}
