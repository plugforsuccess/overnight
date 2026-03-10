'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { EmptyState, FilterBar, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

export default function ShiftRosterPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [form, setForm] = useState({ staff_user_id: '', shift_role: 'STAFF', shift_start: '', shift_end: '' });

  async function authedFetch(path: string, init?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` } });
  }

  async function load() {
    const res = await authedFetch('/api/ops/shifts');
    const payload = await res.json();
    if (res.ok) setShifts(payload.shifts || []);
  }

  useEffect(() => { load(); }, []);

  async function createShift(e: React.FormEvent) {
    e.preventDefault();
    const res = await authedFetch('/api/ops/shifts', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) {
      setForm({ staff_user_id: '', shift_role: 'STAFF', shift_start: '', shift_end: '' });
      load();
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Shift Roster" subtitle="Create, review, and monitor active/upcoming shift coverage" />
      <SectionCard title="Create Shift">
        <form onSubmit={createShift}>
          <FilterBar>
            <input className="input-field" placeholder="Staff user ID" value={form.staff_user_id} onChange={e => setForm({ ...form, staff_user_id: e.target.value })} required />
            <select className="input-field max-w-[180px]" value={form.shift_role} onChange={e => setForm({ ...form, shift_role: e.target.value })}>
              <option>DIRECTOR</option><option>STAFF</option><option>CAREGIVER</option><option>SUPERVISOR</option>
            </select>
            <input className="input-field" type="datetime-local" value={form.shift_start} onChange={e => setForm({ ...form, shift_start: e.target.value })} required />
            <input className="input-field" type="datetime-local" value={form.shift_end} onChange={e => setForm({ ...form, shift_end: e.target.value })} required />
            <button className="btn-primary" type="submit">Create Shift</button>
          </FilterBar>
        </form>
      </SectionCard>
      <SectionCard title="Shift History">
        {shifts.length === 0 ? <EmptyState title="No shifts yet" description="No active or historical shifts found." /> : (
          <div className="space-y-2">
            {shifts.map((shift) => (
              <div key={shift.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="font-medium text-slate-900">{shift.staff_user_id}</p><StatusBadge tone="blue">{shift.shift_role}</StatusBadge></div>
                <p className="text-xs text-slate-500">{shift.shift_start} → {shift.shift_end}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
