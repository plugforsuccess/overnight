'use client';

import { useState } from 'react';
import { Plus, Trash2, Pill } from 'lucide-react';
import type { MedicationAuthorizationRow, MedicationRoute } from '@/types/children';
import { MEDICATION_ROUTE_LABELS } from '@/types/children';

interface Props {
  childId: string;
  medications: MedicationAuthorizationRow[];
  onAdd: (data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}

const ROUTE_OPTIONS: { value: MedicationRoute; label: string }[] = [
  { value: 'oral', label: 'Oral' },
  { value: 'topical', label: 'Topical' },
  { value: 'inhaled', label: 'Inhaled' },
  { value: 'injection', label: 'Injection' },
  { value: 'other', label: 'Other' },
];

const EMPTY_FORM = {
  medication_name: '',
  dosage: '',
  route: 'oral' as MedicationRoute,
  frequency: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  special_instructions: '',
  prescribing_physician: '',
  parent_consent_name: '',
};

export function MedicationAuthorizationEditor({ childId, medications, onAdd, onDelete, saving }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.medication_name.trim()) errs.medication_name = 'Required';
    if (!form.dosage.trim()) errs.dosage = 'Required';
    if (!form.frequency.trim()) errs.frequency = 'Required';
    if (!form.start_date) errs.start_date = 'Required';
    if (!form.parent_consent_name.trim()) errs.parent_consent_name = 'Your typed name serves as your electronic signature';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    try {
      await onAdd({
        ...form,
        end_date: form.end_date || null,
        special_instructions: form.special_instructions.trim() || null,
        prescribing_physician: form.prescribing_physician.trim() || null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setErrors({});
    } catch (err: any) {
      setErrors({ _form: err.message });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Medication Authorizations</h3>
          <p className="text-sm text-gray-500 mt-1">
            Written authorization is required before staff can administer any medication.
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> Add Medication
          </button>
        )}
      </div>

      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        Georgia DECAL requires written parental authorization before any medication can be administered.
        This includes daily prescriptions, antibiotics, and as-needed medications.
      </p>

      {/* Existing medications */}
      {medications.length > 0 ? (
        <div className="space-y-3">
          {medications.map(med => (
            <div key={med.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Pill className="h-5 w-5 text-accent-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-gray-900">{med.medication_name}</h4>
                    <p className="text-sm text-gray-600">{med.dosage} &middot; {MEDICATION_ROUTE_LABELS[med.route]} &middot; {med.frequency}</p>
                    {med.prescribing_physician && <p className="text-xs text-gray-500 mt-1">Prescribed by: {med.prescribing_physician}</p>}
                    <p className="text-xs text-gray-500">
                      {med.start_date}{med.end_date ? ` to ${med.end_date}` : ' (ongoing)'}
                    </p>
                    {med.special_instructions && <p className="text-xs text-gray-500 mt-1">Instructions: {med.special_instructions}</p>}
                    {med.parent_consent_name && (
                      <p className="text-xs text-green-600 mt-1">
                        Authorized by: {med.parent_consent_name} on {med.parent_consent_signed_at ? new Date(med.parent_consent_signed_at).toLocaleDateString() : 'N/A'}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm('Remove this medication authorization?')) onDelete(med.id); }}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Deactivate"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : !showForm ? (
        <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
          <Pill className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p>No medication authorizations on file.</p>
          <p className="text-xs mt-1">Add one if your child takes any medication that may need to be administered during care.</p>
        </div>
      ) : null}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border border-accent-200 bg-accent-50/30 rounded-lg p-4 space-y-4">
          <h4 className="font-semibold text-gray-900">New Medication Authorization</h4>

          {errors._form && <p className="text-sm text-red-600">{errors._form}</p>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Medication Name *</label>
              <input type="text" value={form.medication_name} onChange={e => setForm(f => ({ ...f, medication_name: e.target.value }))} className="input-field" placeholder="e.g., Amoxicillin" />
              {errors.medication_name && <p className="mt-1 text-sm text-red-600">{errors.medication_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dosage *</label>
              <input type="text" value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} className="input-field" placeholder="e.g., 250mg" />
              {errors.dosage && <p className="mt-1 text-sm text-red-600">{errors.dosage}</p>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route *</label>
              <select value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value as MedicationRoute }))} className="input-field">
                {ROUTE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
              <input type="text" value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className="input-field" placeholder="e.g., Twice daily, Every 4 hours" />
              {errors.frequency && <p className="mt-1 text-sm text-red-600">{errors.frequency}</p>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="input-field" />
              {errors.start_date && <p className="mt-1 text-sm text-red-600">{errors.start_date}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prescribing Physician</label>
            <input type="text" value={form.prescribing_physician} onChange={e => setForm(f => ({ ...f, prescribing_physician: e.target.value }))} className="input-field" placeholder="Dr. Jane Smith" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
            <textarea value={form.special_instructions} onChange={e => setForm(f => ({ ...f, special_instructions: e.target.value }))} className="input-field min-h-[60px] resize-none" placeholder="Take with food, store in fridge, etc." maxLength={500} />
          </div>

          <hr className="border-gray-200" />

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Parent Authorization Signature *
            </label>
            <p className="text-xs text-gray-500 mb-2">
              By typing your name below, you authorize staff to administer this medication to your child
              according to the instructions provided.
            </p>
            <input
              type="text"
              value={form.parent_consent_name}
              onChange={e => setForm(f => ({ ...f, parent_consent_name: e.target.value }))}
              className="input-field"
              placeholder="Type your full legal name"
            />
            {errors.parent_consent_name && <p className="mt-1 text-sm text-red-600">{errors.parent_consent_name}</p>}
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setErrors({}); }} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Authorize Medication'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
