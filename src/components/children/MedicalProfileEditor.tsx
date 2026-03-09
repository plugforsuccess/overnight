'use client';

import { useState, useEffect } from 'react';
import type { ChildMedicalProfileRow } from '@/types/children';

interface Props {
  childId: string;
  profile: ChildMedicalProfileRow | null;
  onSave: (data: any) => Promise<void>;
  saving: boolean;
}

export function MedicalProfileEditor({ childId, profile, onSave, saving }: Props) {
  const [physicianName, setPhysicianName] = useState(profile?.physician_name || '');
  const [physicianPhone, setPhysicianPhone] = useState(profile?.physician_phone || '');
  const [hospitalPreference, setHospitalPreference] = useState(profile?.hospital_preference || '');
  const [specialInstructions, setSpecialInstructions] = useState(profile?.special_instructions || '');
  const [hasAllergies, setHasAllergies] = useState(profile?.has_allergies ?? false);
  const [hasMedications, setHasMedications] = useState(profile?.has_medications ?? false);
  const [hasMedicalConditions, setHasMedicalConditions] = useState(profile?.has_medical_conditions ?? false);
  const [allergiesSummary, setAllergiesSummary] = useState(profile?.allergies_summary || '');
  const [medicationsSummary, setMedicationsSummary] = useState(profile?.medications_summary || '');
  const [conditionsSummary, setConditionsSummary] = useState(profile?.medical_conditions_summary || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setPhysicianName(profile?.physician_name || '');
    setPhysicianPhone(profile?.physician_phone || '');
    setHospitalPreference(profile?.hospital_preference || '');
    setSpecialInstructions(profile?.special_instructions || '');
    setHasAllergies(profile?.has_allergies ?? false);
    setHasMedications(profile?.has_medications ?? false);
    setHasMedicalConditions(profile?.has_medical_conditions ?? false);
    setAllergiesSummary(profile?.allergies_summary || '');
    setMedicationsSummary(profile?.medications_summary || '');
    setConditionsSummary(profile?.medical_conditions_summary || '');
  }, [profile]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!physicianName.trim()) errs.physician_name = 'Physician name is required for licensing';
    if (!physicianPhone.trim()) errs.physician_phone = 'Physician phone is required for licensing';
    else {
      const digits = physicianPhone.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) errs.physician_phone = 'Please enter a valid phone number';
    }
    if (hasAllergies && !allergiesSummary.trim()) errs.allergies_summary = 'Please describe allergies';
    if (hasMedications && !medicationsSummary.trim()) errs.medications_summary = 'Please describe medications';
    if (hasMedicalConditions && !conditionsSummary.trim()) errs.conditions_summary = 'Please describe conditions';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      physician_name: physicianName.trim(),
      physician_phone: physicianPhone.trim(),
      hospital_preference: hospitalPreference.trim() || null,
      special_instructions: specialInstructions.trim() || null,
      has_allergies: hasAllergies,
      has_medications: hasMedications,
      has_medical_conditions: hasMedicalConditions,
      allergies_summary: allergiesSummary.trim() || null,
      medications_summary: medicationsSummary.trim() || null,
      medical_conditions_summary: conditionsSummary.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Physician Information</h3>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          Georgia licensing requires physician name and phone number on file for each child.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Physician Name *</label>
            <input
              type="text"
              value={physicianName}
              onChange={e => { setPhysicianName(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.physician_name; return n; }); }}
              className="input-field"
              placeholder="Dr. Jane Smith"
            />
            {errors.physician_name && <p className="mt-1 text-sm text-red-600">{errors.physician_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Physician Phone *</label>
            <input
              type="tel"
              value={physicianPhone}
              onChange={e => { setPhysicianPhone(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.physician_phone; return n; }); }}
              className="input-field"
              placeholder="(555) 123-4567"
            />
            {errors.physician_phone && <p className="mt-1 text-sm text-red-600">{errors.physician_phone}</p>}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Hospital</label>
          <input
            type="text"
            value={hospitalPreference}
            onChange={e => setHospitalPreference(e.target.value)}
            className="input-field"
            placeholder="Children's Healthcare of Atlanta"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
          <input
            type="text"
            value={specialInstructions}
            onChange={e => setSpecialInstructions(e.target.value)}
            className="input-field"
            placeholder="Any special care instructions..."
          />
        </div>
      </div>

      <hr className="border-gray-200" />

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Medical Conditions</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={hasAllergies} onChange={e => setHasAllergies(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <span className="text-sm text-gray-700">Child has known allergies</span>
          </label>
          {hasAllergies && (
            <div>
              <textarea value={allergiesSummary} onChange={e => setAllergiesSummary(e.target.value)} className="input-field min-h-[60px] resize-none" placeholder="Describe allergies..." maxLength={1000} />
              {errors.allergies_summary && <p className="mt-1 text-sm text-red-600">{errors.allergies_summary}</p>}
            </div>
          )}

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={hasMedications} onChange={e => setHasMedications(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <span className="text-sm text-gray-700">Child takes regular medications</span>
          </label>
          {hasMedications && (
            <div>
              <textarea value={medicationsSummary} onChange={e => setMedicationsSummary(e.target.value)} className="input-field min-h-[60px] resize-none" placeholder="Describe medications..." maxLength={1000} />
              {errors.medications_summary && <p className="mt-1 text-sm text-red-600">{errors.medications_summary}</p>}
            </div>
          )}

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={hasMedicalConditions} onChange={e => setHasMedicalConditions(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <span className="text-sm text-gray-700">Child has medical conditions staff should know about</span>
          </label>
          {hasMedicalConditions && (
            <div>
              <textarea value={conditionsSummary} onChange={e => setConditionsSummary(e.target.value)} className="input-field min-h-[60px] resize-none" placeholder="Describe conditions..." maxLength={1000} />
              {errors.conditions_summary && <p className="mt-1 text-sm text-red-600">{errors.conditions_summary}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Medical Profile'}
        </button>
      </div>
    </form>
  );
}
