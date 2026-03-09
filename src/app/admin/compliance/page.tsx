'use client';

import { useEffect, useMemo, useState } from 'react';

type ComplianceRow = {
  childId: string;
  childName: string;
  guardian: string;
  bookingEligibility: boolean;
  immunizationStatus: string;
  allergyPlanStatus: boolean;
  physicianInfoStatus: boolean;
  medicationStatus: boolean;
  documentStatus: string;
  blockers: string[];
  warnings: string[];
  updatedAt: string;
};

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'missing_emergency_contact', label: 'Missing emergency contact' },
  { key: 'missing_pickup', label: 'Missing pickup' },
  { key: 'missing_medical_profile', label: 'Missing medical profile' },
  { key: 'missing_physician_info', label: 'Missing physician info' },
  { key: 'missing_immunization', label: 'Missing immunization' },
  { key: 'expired_immunization', label: 'Expired immunization' },
  { key: 'missing_allergy_plan', label: 'Missing allergy plan' },
  { key: 'expired_medication_auth', label: 'Expired medication auth' },
  { key: 'unverified_documents', label: 'Unverified documents' },
];

export default function AdminCompliancePage() {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const q = filter ? `?filter=${filter}` : '';
    fetch(`/api/admin/compliance${q}`).then(r => r.json()).then(d => setRows(d.children || []));
  }, [filter]);

  const totals = useMemo(() => ({
    ready: rows.filter((r) => r.bookingEligibility).length,
    blocked: rows.filter((r) => !r.bookingEligibility).length,
  }), [rows]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Compliance Audit</h1>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1 rounded border text-sm ${filter === f.key ? 'bg-navy-700 text-white' : 'bg-white'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600">Ready: {totals.ready} • Blocked: {totals.blocked}</p>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Child</th>
              <th className="text-left p-2">Guardian</th>
              <th className="text-left p-2">Ready to Book</th>
              <th className="text-left p-2">Immunization</th>
              <th className="text-left p-2">Allergy Plan</th>
              <th className="text-left p-2">Physician</th>
              <th className="text-left p-2">Medication</th>
              <th className="text-left p-2">Docs</th>
              <th className="text-left p-2">Blockers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.childId} className="border-t align-top">
                <td className="p-2">{r.childName}</td>
                <td className="p-2">{r.guardian}</td>
                <td className="p-2">{r.bookingEligibility ? 'Yes' : 'No'}</td>
                <td className="p-2">{r.immunizationStatus}</td>
                <td className="p-2">{r.allergyPlanStatus ? 'OK' : 'Missing'}</td>
                <td className="p-2">{r.physicianInfoStatus ? 'OK' : 'Missing'}</td>
                <td className="p-2">{r.medicationStatus ? 'OK' : 'Missing/Expired'}</td>
                <td className="p-2">{r.documentStatus}</td>
                <td className="p-2">{r.blockers.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
