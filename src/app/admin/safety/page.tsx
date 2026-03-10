'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { AlertCard, EmptyState, FilterBar, MetricCard, PageHeader, SectionCard, StatusBadge, Timeline, TimelineItem } from '@/components/ui/system';

interface SafetyChild {
  child_id: string;
  name: string;
  safety_status: 'complete' | 'warning' | 'critical';
  emergency_contacts_count: number;
  pickups_count: number;
  allergy_flags: string[];
  caregiver_notes_present: boolean;
  last_attendance_date: string | null;
  issues: { issue: string; severity: 'critical' | 'warning' }[];
  parent: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | null;
}

export default function SafetyDashboard() {
  const [children, setChildren] = useState<SafetyChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'complete'>('all');

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/admin/safety', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) {
      const json = await res.json();
      setChildren(json.children || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const counts = {
    complete: children.filter((c) => c.safety_status === 'complete').length,
    warning: children.filter((c) => c.safety_status === 'warning').length,
    critical: children.filter((c) => c.safety_status === 'critical').length,
  };

  const filtered = filter === 'all' ? children : children.filter((c) => c.safety_status === filter);

  return (
    <div className="space-y-6">
      <PageHeader title="Safety Surface" subtitle="Recent incidents, medication/allergy alerts, and unresolved safety issues" actions={<button onClick={fetchData} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Refresh</button>} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Complete" value={counts.complete} tone="green" />
        <MetricCard label="Warnings" value={counts.warning} tone="yellow" />
        <MetricCard label="Critical" value={counts.critical} tone="red" />
      </div>

      {(counts.critical > 0 || counts.warning > 0) && <AlertCard tone={counts.critical > 0 ? 'red' : 'yellow'} title="Safety attention required">Prioritize critical and warning profiles first for immediate follow-up.</AlertCard>}

      <SectionCard title="Safety Queue">
        <FilterBar>
          {(['all', 'critical', 'warning', 'complete'] as const).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-sm ${filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{f}</button>)}
        </FilterBar>

        {loading ? <p className="text-sm text-slate-500">Loading safety data…</p> : filtered.length === 0 ? <EmptyState title="No children in this filter" description="Try another filter or refresh safety data." /> : (
          <div className="space-y-4">
            {filtered.map((child) => (
              <div key={child.child_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{child.name}</p>
                  <StatusBadge tone={child.safety_status === 'critical' ? 'red' : child.safety_status === 'warning' ? 'yellow' : 'green'}>{child.safety_status}</StatusBadge>
                </div>
                <p className="text-xs text-slate-500">Emergency contacts: {child.emergency_contacts_count} · Pickups: {child.pickups_count} · Last attended: {child.last_attendance_date || '—'}</p>
                {child.issues.length > 0 && (
                  <Timeline>
                    {child.issues.map((issue, idx) => <TimelineItem key={`${child.child_id}-${idx}`} title={issue.issue} tone={issue.severity === 'critical' ? 'red' : 'yellow'} />)}
                  </Timeline>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
