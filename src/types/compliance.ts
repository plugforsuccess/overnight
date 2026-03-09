export type ImmunizationComplianceStatus = 'current' | 'expired' | 'exempt_medical' | 'exempt_religious' | 'missing';

export type ComplianceStatus = {
  childId: string;
  facilityId: string;
  isProfileComplete: boolean;
  hasEmergencyContact: boolean;
  hasAuthorizedPickup: boolean;
  hasMedicalProfile: boolean;
  hasPhysicianInfo: boolean;
  immunizationStatus: ImmunizationComplianceStatus;
  hasRequiredAllergyPlan: boolean;
  hasValidMedicationAuthorization: boolean;
  hasAllergies: boolean;
  hasMedications: boolean;
  blockers: string[];
  warnings: string[];
  eligibleToBook: boolean;
};
