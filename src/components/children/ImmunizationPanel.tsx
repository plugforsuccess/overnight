'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import type { ChildImmunizationRecordRow, ImmunizationStatus } from '@/types/children';
import { IMMUNIZATION_STATUS_LABELS } from '@/types/children';

interface Props {
  childId: string;
  record: ChildImmunizationRecordRow | null;
  onSave: (data: any) => Promise<void>;
  saving: boolean;
}

const STATUS_OPTIONS: { value: ImmunizationStatus; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'expired', label: 'Expired' },
  { value: 'exempt_medical', label: 'Exempt (Medical)' },
  { value: 'exempt_religious', label: 'Exempt (Religious)' },
  { value: 'missing', label: 'Missing' },
];

function StatusBadge({ status }: { status: ImmunizationStatus }) {
  const config: Record<ImmunizationStatus, { icon: typeof CheckCircle2; color: string }> = {
    current: { icon: CheckCircle2, color: 'text-green-600 bg-green-50 border-green-200' },
    expired: { icon: AlertCircle, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    exempt_medical: { icon: ShieldAlert, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    exempt_religious: { icon: ShieldAlert, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    missing: { icon: XCircle, color: 'text-red-600 bg-red-50 border-red-200' },
  };
  const { icon: Icon, color } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${color}`}>
      <Icon className="h-4 w-4" />
      {IMMUNIZATION_STATUS_LABELS[status]}
    </span>
  );
}

export function ImmunizationPanel({ childId, record, onSave, saving }: Props) {
  const [status, setStatus] = useState<ImmunizationStatus>(record?.status || 'missing');
  const [issuedDate, setIssuedDate] = useState(record?.issued_date || '');
  const [expiresAt, setExpiresAt] = useState(record?.expires_at || '');
  const [exemptionReason, setExemptionReason] = useState(record?.exemption_reason || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setStatus(record?.status || 'missing');
    setIssuedDate(record?.issued_date || '');
    setExpiresAt(record?.expires_at || '');
    setExemptionReason(record?.exemption_reason || '');
    setNotes(record?.notes || '');
  }, [record]);

  const isExempt = status === 'exempt_medical' || status === 'exempt_religious';

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (isExempt && !exemptionReason.trim()) {
      errs.exemption_reason = 'Exemption reason is required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      status,
      issued_date: issuedDate || null,
      expires_at: expiresAt || null,
      exemption_reason: isExempt ? exemptionReason.trim() : null,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Immunization Record</h3>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          Georgia DECAL requires a current Certificate of Immunization (Form 3231) on file for every enrolled child.
          This is the most commonly cited deficiency during licensing inspections.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">Current Status:</span>
        <StatusBadge status={status} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Immunization Status *</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as ImmunizationStatus)}
          className="input-field"
        >
          {STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {(status === 'current' || status === 'expired') && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Issued</label>
            <input
              type="date"
              value={issuedDate}
              onChange={e => setIssuedDate(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      )}

      {isExempt && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Exemption Reason *</label>
          <textarea
            value={exemptionReason}
            onChange={e => { setExemptionReason(e.target.value); setErrors(prev => { const n = { ...prev }; delete n.exemption_reason; return n; }); }}
            className="input-field min-h-[80px] resize-none"
            placeholder="Describe the exemption reason..."
            maxLength={500}
          />
          {errors.exemption_reason && <p className="mt-1 text-sm text-red-600">{errors.exemption_reason}</p>}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="input-field min-h-[60px] resize-none"
          placeholder="Additional notes about immunization record..."
          maxLength={500}
        />
      </div>

      {record?.verified_at && (
        <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
          Verified on {new Date(record.verified_at).toLocaleDateString()}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Immunization Record'}
        </button>
      </div>
    </form>
  );
}
