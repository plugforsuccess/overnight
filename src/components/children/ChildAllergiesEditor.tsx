'use client';

import { useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import {
  ALLERGY_TYPES,
  ALLERGY_TYPE_LABELS,
  ALLERGY_SEVERITIES,
  SEVERITY_LABELS,
  TREATMENT_TYPES,
  TREATMENT_LABELS,
  type AllergyType,
  type AllergySeverity,
  type TreatmentType,
  type ChildAllergyRow,
} from '@/types/children';

interface AllergyFormData {
  allergen: AllergyType;
  custom_label: string;
  severity: AllergySeverity;
  action_plan: {
    treatment_first_line: TreatmentType;
    dose_instructions: string;
    symptoms_watch: string[];
    med_location: string;
    requires_med_on_site: boolean;
    medication_expires_on: string;
    physician_name: string;
    parent_confirmed: boolean;
  };
}

interface Props {
  childId: string;
  allergies: ChildAllergyRow[];
  onSave: (allergies: AllergyFormData[]) => Promise<void>;
  saving: boolean;
}

const MEDS_TREATMENTS: string[] = ['EPINEPHRINE_AUTOINJECTOR', 'INHALER'];

function emptyActionPlan() {
  return {
    treatment_first_line: 'NONE' as TreatmentType,
    dose_instructions: '',
    symptoms_watch: [] as string[],
    med_location: '',
    requires_med_on_site: false,
    medication_expires_on: '',
    physician_name: '',
    parent_confirmed: false,
  };
}

function allergyRowToForm(a: ChildAllergyRow): AllergyFormData {
  const plan = (a as any).child_allergy_action_plans?.[0] || a.action_plan;
  return {
    allergen: a.allergen,
    custom_label: a.custom_label || '',
    severity: a.severity,
    action_plan: plan ? {
      treatment_first_line: plan.treatment_first_line,
      dose_instructions: plan.dose_instructions || '',
      symptoms_watch: Array.isArray(plan.symptoms_watch) ? plan.symptoms_watch : [],
      med_location: plan.med_location || '',
      requires_med_on_site: plan.requires_med_on_site,
      medication_expires_on: plan.medication_expires_on || '',
      physician_name: plan.physician_name || '',
      parent_confirmed: false, // require re-confirmation on edit
    } : emptyActionPlan(), // always initialize action plan — it's required
  };
}

export function ChildAllergiesEditor({ childId, allergies, onSave, saving }: Props) {
  const [items, setItems] = useState<AllergyFormData[]>(
    allergies.map(allergyRowToForm)
  );
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [error, setError] = useState('');

  function addAllergy() {
    setItems(prev => [...prev, {
      allergen: 'PEANUT',
      custom_label: '',
      severity: 'UNKNOWN',
      action_plan: emptyActionPlan(),
    }]);
    setExpandedIdx(items.length);
  }

  function removeAllergy(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  }

  function updateAllergy(idx: number, updates: Partial<AllergyFormData>) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  }

  function updateActionPlan(idx: number, updates: Partial<AllergyFormData['action_plan']>) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, action_plan: { ...item.action_plan, ...updates } };
    }));
  }

  function validate(): string | null {
    const keys = items.map(a => `${a.allergen}:${a.custom_label}`);
    if (new Set(keys).size !== keys.length) return 'Duplicate allergies found';

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (a.allergen === 'OTHER' && (!a.custom_label || a.custom_label.trim().length < 2)) {
        return `Allergy #${i + 1}: Custom label required for "Other" (min 2 chars)`;
      }
      if (!a.action_plan) {
        return `Allergy #${i + 1}: Emergency action plan is required`;
      }
      const p = a.action_plan;
      if (!p.parent_confirmed) {
        return `Allergy #${i + 1}: Parent confirmation required for action plan`;
      }
      const needsMedExpiry = p.requires_med_on_site || MEDS_TREATMENTS.includes(p.treatment_first_line);
      if (needsMedExpiry) {
        if (!p.medication_expires_on) {
          return `Allergy #${i + 1}: Medication expiry date required`;
        }
        if (new Date(p.medication_expires_on) <= new Date()) {
          return `Allergy #${i + 1}: Medication expiry must be in the future`;
        }
      }
    }
    return null;
  }

  async function handleSave() {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    try {
      await onSave(items);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {items.length === 0 && (
        <p className="text-gray-500 text-sm">No allergies recorded. Click below to add one.</p>
      )}

      {items.map((allergy, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-gray-700"
            >
              {expandedIdx === idx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {ALLERGY_TYPE_LABELS[allergy.allergen]}
              {allergy.custom_label ? ` (${allergy.custom_label})` : ''}
              <span className={`badge ${
                allergy.severity === 'SEVERE' ? 'badge-red' :
                allergy.severity === 'MODERATE' ? 'badge-yellow' :
                allergy.severity === 'MILD' ? 'badge-green' : 'badge-blue'
              }`}>
                {SEVERITY_LABELS[allergy.severity]}
              </span>
            </button>
            <button
              type="button"
              onClick={() => removeAllergy(idx)}
              className="p-1 text-red-500 hover:text-red-700"
              title="Remove allergy"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {expandedIdx === idx && (
            <div className="mt-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergen</label>
                  <select
                    value={allergy.allergen}
                    onChange={e => updateAllergy(idx, { allergen: e.target.value as AllergyType })}
                    className="input-field"
                  >
                    {ALLERGY_TYPES.map(t => (
                      <option key={t} value={t}>{ALLERGY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                  <select
                    value={allergy.severity}
                    onChange={e => updateAllergy(idx, { severity: e.target.value as AllergySeverity })}
                    className="input-field"
                  >
                    {ALLERGY_SEVERITIES.map(s => (
                      <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {allergy.allergen === 'OTHER' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom Label *</label>
                  <input
                    type="text"
                    value={allergy.custom_label}
                    onChange={e => updateAllergy(idx, { custom_label: e.target.value })}
                    className="input-field"
                    placeholder="Describe the allergen"
                    maxLength={50}
                    required
                  />
                </div>
              )}

              {/* Emergency Action Plan (required) */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Emergency Action Plan <span className="text-red-500">*</span>
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First-Line Treatment *</label>
                      <select
                        value={allergy.action_plan.treatment_first_line}
                        onChange={e => updateActionPlan(idx, { treatment_first_line: e.target.value as TreatmentType })}
                        className="input-field"
                      >
                        {TREATMENT_TYPES.map(t => (
                          <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Physician Name</label>
                      <input
                        type="text"
                        value={allergy.action_plan.physician_name}
                        onChange={e => updateActionPlan(idx, { physician_name: e.target.value })}
                        className="input-field"
                        placeholder="Dr. Smith"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dose / Instructions</label>
                    <textarea
                      value={allergy.action_plan.dose_instructions}
                      onChange={e => updateActionPlan(idx, { dose_instructions: e.target.value })}
                      className="input-field min-h-[60px] resize-none"
                      placeholder="e.g. Administer 0.3mg EpiPen in outer thigh"
                      maxLength={500}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Medication Location</label>
                      <input
                        type="text"
                        value={allergy.action_plan.med_location}
                        onChange={e => updateActionPlan(idx, { med_location: e.target.value })}
                        className="input-field"
                        placeholder="e.g. Front desk, backpack"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mt-6 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allergy.action_plan.requires_med_on_site}
                          onChange={e => updateActionPlan(idx, { requires_med_on_site: e.target.checked })}
                          className="w-4 h-4 text-accent-600 focus:ring-accent-500 rounded"
                        />
                        <span className="text-sm font-medium text-gray-700">Requires medication on site</span>
                      </label>
                    </div>
                  </div>

                  {(allergy.action_plan.requires_med_on_site ||
                    MEDS_TREATMENTS.includes(allergy.action_plan.treatment_first_line)) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Medication Expires On *</label>
                      <input
                        type="date"
                        value={allergy.action_plan.medication_expires_on}
                        onChange={e => updateActionPlan(idx, { medication_expires_on: e.target.value })}
                        className="input-field"
                        required
                      />
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allergy.action_plan.parent_confirmed}
                        onChange={e => updateActionPlan(idx, { parent_confirmed: e.target.checked })}
                        className="w-4 h-4 text-accent-600 focus:ring-accent-500 rounded"
                      />
                      <span className="text-sm font-medium text-gray-900">
                        I confirm this action plan is accurate and up to date
                      </span>
                    </label>
                  </div>
                </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addAllergy}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" /> Add Allergy
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving...' : 'Save Allergies'}
        </button>
      </div>
    </div>
  );
}
