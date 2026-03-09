import { z } from 'zod';

// ─── Enum schemas ────────────────────────────────────────────────────────────

export const allergyTypeSchema = z.enum([
  'PEANUT', 'TREE_NUT', 'MILK', 'EGG', 'WHEAT', 'SOY', 'FISH', 'SHELLFISH',
  'SESAME', 'PENICILLIN', 'INSECT_STING', 'LATEX', 'ASTHMA', 'ENVIRONMENTAL', 'OTHER',
]);

export const allergySeveritySchema = z.enum(['UNKNOWN', 'MILD', 'MODERATE', 'SEVERE']);

export const treatmentTypeSchema = z.enum([
  'NONE', 'ANTIHISTAMINE', 'EPINEPHRINE_AUTOINJECTOR', 'INHALER', 'CALL_911', 'OTHER',
]);

// ─── Child basics ────────────────────────────────────────────────────────────

const MAX_AGE_YEARS = 18;

export const childBasicsSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50, 'First name must be 50 characters or less'),
  last_name: z.string().trim().min(1, 'Last name is required').max(50, 'Last name must be 50 characters or less'),
  date_of_birth: z.string().refine((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    if (date >= now) return false;
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - MAX_AGE_YEARS);
    if (date < minDate) return false;
    return true;
  }, { message: `Date of birth must be a valid past date within the last ${MAX_AGE_YEARS} years` }),
  medical_notes: z.string().max(500, 'Medical notes must be 500 characters or less').optional().nullable(),
});

export type ChildBasicsInput = z.infer<typeof childBasicsSchema>;

// ─── Allergy + Action Plan ───────────────────────────────────────────────────

const MEDS_TREATMENTS: string[] = ['EPINEPHRINE_AUTOINJECTOR', 'INHALER'];

export const actionPlanSchema = z.object({
  treatment_first_line: treatmentTypeSchema,
  dose_instructions: z.string().max(500).optional().nullable(),
  symptoms_watch: z.array(z.string()).optional().nullable(),
  med_location: z.string().max(200).optional().nullable(),
  requires_med_on_site: z.boolean().default(false),
  medication_expires_on: z.string().optional().nullable(),
  physician_name: z.string().max(100).optional().nullable(),
  parent_confirmed: z.boolean(),
}).refine((data) => {
  if (data.requires_med_on_site || MEDS_TREATMENTS.includes(data.treatment_first_line)) {
    if (!data.medication_expires_on) return false;
    const expiryDate = new Date(data.medication_expires_on);
    return expiryDate > new Date();
  }
  return true;
}, {
  message: 'Medication expiry date is required and must be in the future when medication is required on site',
  path: ['medication_expires_on'],
}).refine((data) => data.parent_confirmed === true, {
  message: 'Parent confirmation is required to save action plan changes',
  path: ['parent_confirmed'],
});

export type ActionPlanInput = z.infer<typeof actionPlanSchema>;

export const allergySchema = z.object({
  allergen: allergyTypeSchema,
  custom_label: z.string().max(50).optional().nullable(),
  severity: allergySeveritySchema.default('UNKNOWN'),
  action_plan: actionPlanSchema,
}).refine((data) => {
  if (data.allergen === 'OTHER') {
    return data.custom_label && data.custom_label.trim().length >= 2;
  }
  return true;
}, {
  message: 'Custom label is required for "Other" allergen (min 2 characters)',
  path: ['custom_label'],
});

export type AllergyInput = z.infer<typeof allergySchema>;

export const allergiesListSchema = z.array(allergySchema).refine((allergies) => {
  const keys = allergies.map(a => `${a.allergen}:${a.custom_label || ''}`);
  return new Set(keys).size === keys.length;
}, { message: 'Duplicate allergies are not allowed' });

// ─── Emergency Contact ───────────────────────────────────────────────────────

const phoneSchema = z.string().min(1, 'Phone number is required').refine((val) => {
  const digits = val.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}, { message: 'Please enter a valid phone number (10-11 digits)' });

export { phoneSchema };

export const emergencyContactSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50),
  last_name: z.string().trim().min(1, 'Last name is required').max(50),
  relationship: z.string().trim().min(1, 'Relationship is required').max(50),
  phone: phoneSchema,
  phone_alt: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(2),
  authorized_for_pickup: z.boolean().default(false),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

// ─── Authorized Pickup ───────────────────────────────────────────────────────

export const authorizedPickupSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50),
  last_name: z.string().trim().min(1, 'Last name is required').max(50),
  relationship: z.string().trim().min(1, 'Relationship is required').max(50),
  phone: phoneSchema,
  pickup_pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
  notes: z.string().max(500).optional().nullable(),
});

export type AuthorizedPickupInput = z.infer<typeof authorizedPickupSchema>;

// For update (PIN optional -- only set if resetting)
export const authorizedPickupUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  relationship: z.string().trim().min(1).max(50),
  phone: phoneSchema,
  pickup_pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits').optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type AuthorizedPickupUpdateInput = z.infer<typeof authorizedPickupUpdateSchema>;

// ─── Medical Profile / Safety Acknowledgement ────────────────────────────────

export const medicalAckSchema = z.object({
  has_allergies: z.boolean(),
  has_medications: z.boolean(),
  has_medical_conditions: z.boolean(),
  allergies_summary: z.string().max(1000).optional().nullable(),
  medications_summary: z.string().max(1000).optional().nullable(),
  medical_conditions_summary: z.string().max(1000).optional().nullable(),
}).refine((data) => {
  if (data.has_allergies && (!data.allergies_summary || data.allergies_summary.trim().length === 0)) return false;
  return true;
}, { message: 'Please describe your child\'s allergies', path: ['allergies_summary'] })
.refine((data) => {
  if (data.has_medications && (!data.medications_summary || data.medications_summary.trim().length === 0)) return false;
  return true;
}, { message: 'Please describe your child\'s medications', path: ['medications_summary'] })
.refine((data) => {
  if (data.has_medical_conditions && (!data.medical_conditions_summary || data.medical_conditions_summary.trim().length === 0)) return false;
  return true;
}, { message: 'Please describe your child\'s medical conditions', path: ['medical_conditions_summary'] });

export type MedicalAckInput = z.infer<typeof medicalAckSchema>;

// Full medical profile (for dashboard completion)
export const medicalProfileSchema = medicalAckSchema.and(z.object({
  physician_name: z.string().max(100).optional().nullable(),
  physician_phone: z.string().max(20).optional().nullable(),
  hospital_preference: z.string().max(200).optional().nullable(),
  special_instructions: z.string().max(1000).optional().nullable(),
}));

export type MedicalProfileInput = z.infer<typeof medicalProfileSchema>;

// ─── Immunization Record ─────────────────────────────────────────────────────

export const immunizationStatusSchema = z.enum([
  'current', 'expired', 'exempt_medical', 'exempt_religious', 'missing',
]);

export const immunizationRecordSchema = z.object({
  status: immunizationStatusSchema,
  issued_date: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  exemption_reason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
}).refine((data) => {
  if (data.status === 'exempt_medical' || data.status === 'exempt_religious') {
    return data.exemption_reason && data.exemption_reason.trim().length > 0;
  }
  return true;
}, {
  message: 'Exemption reason is required for exempt status',
  path: ['exemption_reason'],
});

export type ImmunizationRecordInput = z.infer<typeof immunizationRecordSchema>;

// ─── Medication Authorization ────────────────────────────────────────────────

export const medicationRouteSchema = z.enum(['oral', 'topical', 'inhaled', 'injection', 'other']);

export const medicationAuthorizationSchema = z.object({
  medication_name: z.string().trim().min(1, 'Medication name is required').max(100),
  dosage: z.string().trim().min(1, 'Dosage is required').max(100),
  route: medicationRouteSchema,
  frequency: z.string().trim().min(1, 'Frequency is required').max(100),
  start_date: z.string().refine(val => !isNaN(new Date(val).getTime()), {
    message: 'Valid start date is required',
  }),
  end_date: z.string().optional().nullable(),
  special_instructions: z.string().max(500).optional().nullable(),
  prescribing_physician: z.string().max(100).optional().nullable(),
  parent_consent_name: z.string().trim().min(1, 'Parent signature (typed name) is required').max(100),
});

export type MedicationAuthorizationInput = z.infer<typeof medicationAuthorizationSchema>;

// ─── Document Upload ─────────────────────────────────────────────────────────

export const documentTypeSchema = z.enum([
  'immunization_certificate', 'medication_authorization', 'photo_id', 'consent_form', 'physician_note', 'incident_attachment', 'other',
]);

export const childDocumentSchema = z.object({
  document_type: documentTypeSchema,
  file_name: z.string().min(1, 'File name is required'),
  expires_at: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type ChildDocumentInput = z.infer<typeof childDocumentSchema>;

// ─── Parent Profile ──────────────────────────────────────────────────────────

export const parentProfileSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(50),
  last_name: z.string().trim().min(1, 'Last name is required').max(50),
  phone: phoneSchema,
  address: z.string().max(200).optional().nullable(),
});

export type ParentProfileInput = z.infer<typeof parentProfileSchema>;

// ─── Onboarding Status ───────────────────────────────────────────────────────

export const onboardingStatusSchema = z.enum([
  'started',
  'parent_profile_complete',
  'child_created',
  'medical_ack_complete',
  'emergency_contact_added',
  'complete',
]);

export type OnboardingStatusInput = z.infer<typeof onboardingStatusSchema>;
