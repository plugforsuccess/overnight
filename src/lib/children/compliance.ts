import { supabaseAdmin } from '@/lib/supabase-server';

import type { ComplianceStatus, ImmunizationComplianceStatus } from '@/types/compliance';
const EXPIRING_SOON_DAYS = 30;
const isFutureDate = (value?: string | null) => !!value && new Date(value).getTime() > Date.now();
const isExpiringSoon = (value?: string | null) => !!value && new Date(value).getTime() > Date.now() && new Date(value).getTime() <= Date.now() + (EXPIRING_SOON_DAYS * 86400000);
export const canChildBook = (status: ComplianceStatus) => status.eligibleToBook;
export const getComplianceChecklist = (status: ComplianceStatus) => [
  { key: 'profile', label: 'Basic profile', complete: status.isProfileComplete },
  { key: 'emergency', label: 'Emergency contact', complete: status.hasEmergencyContact },
  { key: 'pickup', label: 'Authorized pickup', complete: status.hasAuthorizedPickup },
  { key: 'medical', label: 'Medical profile', complete: status.hasMedicalProfile },
  { key: 'physician', label: 'Physician info', complete: status.hasPhysicianInfo },
  { key: 'immunization', label: 'Immunization', complete: ['current', 'exempt_medical', 'exempt_religious'].includes(status.immunizationStatus), detail: status.immunizationStatus },
  { key: 'allergy_plan', label: 'Allergy action plan (if needed)', complete: status.hasRequiredAllergyPlan },
  { key: 'medication', label: 'Medication authorization (if needed)', complete: status.hasValidMedicationAuthorization },
];

export async function getChildComplianceStatus(childId: string, facilityId: string): Promise<ComplianceStatus> {
  const [childRes, emergencyRes, pickupRes, medicalRes, immunizationRes, allergiesRes, medicationsRes, documentsRes] = await Promise.all([
    supabaseAdmin.from('children').select('id, first_name, last_name, date_of_birth').eq('id', childId).eq('facility_id', facilityId).single(),
    supabaseAdmin.from('child_emergency_contacts').select('id', { count: 'exact', head: true }).eq('child_id', childId).eq('facility_id', facilityId),
    supabaseAdmin.from('child_authorized_pickups').select('id', { count: 'exact', head: true }).eq('child_id', childId).eq('facility_id', facilityId).is('archived_at', null).eq('is_active', true),
    supabaseAdmin.from('child_medical_profiles').select('*').eq('child_id', childId).eq('facility_id', facilityId).maybeSingle(),
    supabaseAdmin.from('child_immunization_records').select('status, expires_at').eq('child_id', childId).eq('facility_id', facilityId).maybeSingle(),
    supabaseAdmin.from('child_allergies').select('id, severity').eq('child_id', childId),
    supabaseAdmin.from('medication_authorizations').select('id, end_date, is_active').eq('child_id', childId),
    supabaseAdmin.from('child_documents').select('id, verified, expires_at').eq('child_id', childId).eq('facility_id', facilityId).eq('is_active', true),
  ]);
  if (childRes.error || !childRes.data) throw new Error('Child not found for compliance evaluation');

  const allergies = allergiesRes.data || [];
  const severeAllergyIds = allergies.filter((a) => a.severity === 'SEVERE').map((a) => a.id);
  const plansRes = severeAllergyIds.length
    ? await supabaseAdmin.from('child_allergy_action_plans').select('child_allergy_id').in('child_allergy_id', severeAllergyIds)
    : { data: [], error: null };
  if ((plansRes as any).error) throw (plansRes as any).error;

  const medProfile = medicalRes.data;
  const immunizationStatus = (immunizationRes.data?.status || 'missing') as ImmunizationComplianceStatus;
  const hasAllergies = !!medProfile?.has_allergies;
  const hasMedications = !!medProfile?.has_medications;

  const hasRequiredAllergyPlan = !hasAllergies
    || (allergies.length > 0 && (severeAllergyIds.length === 0 || severeAllergyIds.every((id) => (plansRes.data || []).some((p: any) => p.child_allergy_id === id))));
  const hasValidMedicationAuthorization = !hasMedications || (medicationsRes.data || []).filter((m) => m.is_active !== false).some((m) => !m.end_date || isFutureDate(m.end_date));

  const blockers: string[] = [];
  if ((emergencyRes.count || 0) < 1) blockers.push('Add at least one emergency contact');
  if ((pickupRes.count || 0) < 1) blockers.push('Add at least one authorized pickup');
  if (!medProfile) blockers.push('Complete medical profile');
  if (!medProfile?.physician_name?.trim() || !medProfile?.physician_phone?.trim()) blockers.push('Complete physician name and phone');
  if (!['current', 'exempt_medical', 'exempt_religious'].includes(immunizationStatus)) blockers.push('Upload or update immunization record');
  if (hasAllergies && allergies.length < 1) blockers.push('Add at least one allergy record');
  if (!hasRequiredAllergyPlan) blockers.push('Add allergy action plan for severe allergy');
  if (!hasValidMedicationAuthorization) blockers.push('Replace expired medication authorization');

  const warnings: string[] = [];
  if (isExpiringSoon(immunizationRes.data?.expires_at)) warnings.push('Immunization expiring soon');
  if ((medicationsRes.data || []).some((m) => isExpiringSoon(m.end_date))) warnings.push('Medication authorization expiring soon');
  if ((documentsRes.data || []).some((d) => d.verified === false)) warnings.push('Documents awaiting admin review');
  if ((documentsRes.data || []).some((d) => d.expires_at && !isFutureDate(d.expires_at))) warnings.push('One or more documents are expired');

  return {
    childId,
    facilityId,
    isProfileComplete: !!(childRes.data.first_name && childRes.data.last_name && childRes.data.date_of_birth),
    hasEmergencyContact: (emergencyRes.count || 0) > 0,
    hasAuthorizedPickup: (pickupRes.count || 0) > 0,
    hasMedicalProfile: !!medProfile,
    hasPhysicianInfo: !!(medProfile?.physician_name?.trim() && medProfile?.physician_phone?.trim()),
    immunizationStatus,
    hasRequiredAllergyPlan,
    hasValidMedicationAuthorization,
    hasAllergies,
    hasMedications,
    blockers,
    warnings,
    eligibleToBook: blockers.length === 0,
  };
}
