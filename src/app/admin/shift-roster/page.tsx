'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

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
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Shift Roster</h1>
      <form className="card p-4 grid md:grid-cols-4 gap-3" onSubmit={createShift}>
        <input className="input" placeholder="Staff user ID" value={form.staff_user_id} onChange={e => setForm({ ...form, staff_user_id: e.target.value })} required />
        <select className="input" value={form.shift_role} onChange={e => setForm({ ...form, shift_role: e.target.value })}>
          <option>DIRECTOR</option><option>STAFF</option><option>CAREGIVER</option><option>SUPERVISOR</option>
        </select>
        <input className="input" type="datetime-local" value={form.shift_start} onChange={e => setForm({ ...form, shift_start: e.target.value })} required />
        <input className="input" type="datetime-local" value={form.shift_end} onChange={e => setForm({ ...form, shift_end: e.target.value })} required />
        <button className="btn-primary md:col-span-4" type="submit">Create Shift</button>
      </form>
      <div className="card p-4">
        <h2 className="font-semibold mb-3">Shift History</h2>
        <pre className="text-xs overflow-auto">{JSON.stringify(shifts, null, 2)}</pre>
      </div>
    </div>
  );
}
