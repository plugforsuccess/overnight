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
  first_name: z.string().min(1, 'First name is required').max(50, 'First name must be 50 characters or less'),
  last_name: z.string().min(1, 'Last name is required').max(50, 'Last name must be 50 characters or less'),
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
  action_plan: actionPlanSchema.optional().nullable(),
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

export const emergencyContactSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(50),
  last_name: z.string().min(1, 'Last name is required').max(50),
  relationship: z.string().min(1, 'Relationship is required').max(50),
  phone: phoneSchema,
  phone_alt: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(2),
  authorized_for_pickup: z.boolean().default(false),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

// ─── Authorized Pickup ───────────────────────────────────────────────────────

export const authorizedPickupSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(50),
  last_name: z.string().min(1, 'Last name is required').max(50),
  relationship: z.string().min(1, 'Relationship is required').max(50),
  phone: phoneSchema,
  pickup_pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits'),
  notes: z.string().max(500).optional().nullable(),
});

export type AuthorizedPickupInput = z.infer<typeof authorizedPickupSchema>;

// For update (PIN optional — only set if resetting)
export const authorizedPickupUpdateSchema = z.object({
  first_name: z.string().min(1).max(50),
  last_name: z.string().min(1).max(50),
  relationship: z.string().min(1).max(50),
  phone: phoneSchema,
  pickup_pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits').optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type AuthorizedPickupUpdateInput = z.infer<typeof authorizedPickupUpdateSchema>;
