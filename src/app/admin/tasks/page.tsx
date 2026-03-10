'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function StaffTasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [form, setForm] = useState({ task_type: 'GENERAL', description: '', assigned_to: '' });

  async function authedFetch(path: string, init?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` } });
  }

  async function load() {
    const res = await authedFetch('/api/ops/tasks');
    const payload = await res.json();
    if (res.ok) setTasks(payload.tasks || []);
  }

  useEffect(() => { load(); }, []);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const res = await authedFetch('/api/ops/tasks', { method: 'POST', body: JSON.stringify(form) });
    if (res.ok) {
      setForm({ task_type: 'GENERAL', description: '', assigned_to: '' });
      load();
    }
  }

  async function updateStatus(id: string, status: string) {
    const res = await authedFetch(`/api/ops/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (res.ok) load();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Staff Tasks</h1>
      <form className="card p-4 grid md:grid-cols-3 gap-3" onSubmit={createTask}>
        <select className="input" value={form.task_type} onChange={e => setForm({ ...form, task_type: e.target.value })}>
          <option>CHECKIN</option><option>CHECKOUT</option><option>PICKUP</option><option>INCIDENT_FOLLOWUP</option><option>DOCUMENT_REVIEW</option><option>MEDICATION</option><option>HANDOFF</option><option>GENERAL</option>
        </select>
        <input className="input" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
        <input className="input" placeholder="Assign to user ID (optional)" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} />
        <button className="btn-primary md:col-span-3" type="submit">Create Task</button>
      </form>
      <div className="card p-4 space-y-2">
        <h2 className="font-semibold mb-3">Tasks by Status</h2>
        {tasks.map(task => (
          <div key={task.id} className="border border-gray-200 rounded p-3 text-sm flex items-center justify-between">
            <div>
              <div className="font-medium">{task.task_type} - {task.description}</div>
              <div className="text-gray-500">Status: {task.status}</div>
            </div>
            <div className="space-x-2">
              <button className="btn-secondary" onClick={() => updateStatus(task.id, 'DONE')}>Complete</button>
              <button className="btn-secondary" onClick={() => updateStatus(task.id, 'CANCELLED')}>Cancel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
