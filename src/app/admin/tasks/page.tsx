'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { EmptyState, FilterBar, PageHeader, StatusBadge, TaskRow } from '@/components/ui/system';

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
    <div className="space-y-4">
      <PageHeader title="Staff Tasks" subtitle="Operational task queue with assignment and completion controls" />
      <form className="rounded-2xl border border-slate-200 bg-white p-4" onSubmit={createTask}>
        <FilterBar>
          <select className="input-field max-w-[180px]" value={form.task_type} onChange={e => setForm({ ...form, task_type: e.target.value })}>
            <option>CHECKIN</option><option>CHECKOUT</option><option>PICKUP</option><option>INCIDENT_FOLLOWUP</option><option>DOCUMENT_REVIEW</option><option>MEDICATION</option><option>HANDOFF</option><option>GENERAL</option>
          </select>
          <input className="input-field flex-1" placeholder="Task description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
          <input className="input-field max-w-[260px]" placeholder="Assign user ID" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} />
          <button className="btn-primary" type="submit">Create Task</button>
        </FilterBar>
      </form>
      <div className="space-y-2">
        {tasks.length === 0 ? <EmptyState title="No open tasks" description="Create your first operations task for tonight." /> : tasks.map((task) => (
          <TaskRow
            key={task.id}
            title={`${task.task_type}: ${task.description}`}
            meta={task.assigned_to ? `Assigned: ${task.assigned_to}` : 'Unassigned'}
            status={<StatusBadge tone={task.status === 'DONE' ? 'green' : task.status === 'CANCELLED' ? 'gray' : 'yellow'}>{task.status}</StatusBadge>}
            actions={<><button className="btn-secondary py-1.5" onClick={() => updateStatus(task.id, 'DONE')}>Complete</button><button className="btn-secondary py-1.5" onClick={() => updateStatus(task.id, 'CANCELLED')}>Cancel</button></>}
          />
        ))}
      </div>
    </div>
  );
}
