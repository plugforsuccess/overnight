'use client';

import { useState } from 'react';
import type { ChildRow } from '@/types/children';

interface Props {
  child: ChildRow | null;
  onSave: (data: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    medical_notes: string;
  }) => Promise<void>;
  saving: boolean;
}

export function ChildFormBasics({ child, onSave, saving }: Props) {
  const [firstName, setFirstName] = useState(child?.first_name || '');
  const [lastName, setLastName] = useState(child?.last_name || '');
  const [dob, setDob] = useState(child?.date_of_birth || '');
  const [medicalNotes, setMedicalNotes] = useState(child?.medical_notes || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.first_name = 'First name is required';
    else if (firstName.length > 50) errs.first_name = 'Max 50 characters';
    if (!lastName.trim()) errs.last_name = 'Last name is required';
    else if (lastName.length > 50) errs.last_name = 'Max 50 characters';
    if (!dob) errs.date_of_birth = 'Date of birth is required';
    else {
      const date = new Date(dob);
      const now = new Date();
      if (date >= now) errs.date_of_birth = 'Must be in the past';
      const minDate = new Date();
      minDate.setFullYear(minDate.getFullYear() - 18);
      if (date < minDate) errs.date_of_birth = 'Must be within the last 18 years';
    }
    if (medicalNotes.length > 500) errs.medical_notes = 'Max 500 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      date_of_birth: dob,
      medical_notes: medicalNotes.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
          <input
            type="text"
            value={firstName}
            onChange={e => { setFirstName(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.first_name; return n; }); }}
            className="input-field"
            required
          />
          {errors.first_name && <p className="mt-1 text-sm text-red-600">{errors.first_name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
          <input
            type="text"
            value={lastName}
            onChange={e => { setLastName(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.last_name; return n; }); }}
            className="input-field"
            required
          />
          {errors.last_name && <p className="mt-1 text-sm text-red-600">{errors.last_name}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
        <input
          type="date"
          value={dob}
          onChange={e => { setDob(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.date_of_birth; return n; }); }}
          className="input-field"
          required
        />
        {errors.date_of_birth && <p className="mt-1 text-sm text-red-600">{errors.date_of_birth}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Medical Notes <span className="text-gray-400 font-normal">(optional, max 500 chars)</span>
        </label>
        <textarea
          value={medicalNotes}
          onChange={e => setMedicalNotes(e.target.value)}
          className="input-field min-h-[80px] resize-none"
          maxLength={500}
          placeholder="Any non-emergency medical information..."
        />
        <p className="text-xs text-gray-400 mt-1">{medicalNotes.length}/500</p>
        {errors.medical_notes && <p className="mt-1 text-sm text-red-600">{errors.medical_notes}</p>}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : child ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
