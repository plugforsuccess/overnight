'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { EmptyState, FilterBar, IncidentPanel, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

interface IncidentEvent {
  event_id: string;
  event_type: string;
  child_id: string | null;
  child_name: string | null;
  timestamp: string;
  metadata: Record<string, any>;
  severity: string;
  source: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  reservation_night_created: 'Night Booked', reservation_night_confirmed: 'Night Confirmed', waitlist_promoted: 'Waitlist Promoted', reservation_night_cancelled: 'Night Cancelled', child_checked_in: 'Checked In', child_checked_out: 'Checked Out', attendance_status_corrected: 'Attendance Corrected', no_show_marked: 'No-Show', attendance_record_created: 'Attendance Record Created', capacity_override_applied: 'Capacity Override', capacity_override_deactivated: 'Override Removed', night_closed: 'Night Closed', night_reopened: 'Night Reopened', capacity_reduced: 'Capacity Reduced',
};

function tone(severity: string): 'red' | 'yellow' | 'blue' | 'gray' {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'yellow';
  if (severity === 'info') return 'blue';
  return 'gray';
}

export default function IncidentsDashboard() {
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [pagination, setPagination] = useState({ total: 0, limit: 100, offset: 0 });

  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const params = new URLSearchParams({ limit: '100', offset: '0' });
    if (severityFilter !== 'all') params.set('severity', severityFilter);

    const res = await fetch(`/api/admin/incidents?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) {
      const json = await res.json();
      setEvents(json.events || []);
      setPagination(json.pagination || { total: 0, limit: 100, offset: 0 });
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [severityFilter]);

  const severityCounts = {
    critical: events.filter((e) => e.severity === 'critical').length,
    warning: events.filter((e) => e.severity === 'warning').length,
    info: events.filter((e) => e.severity === 'info').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Incidents & Events" subtitle={`${pagination.total} events logged`} actions={<button onClick={fetchData} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Refresh</button>} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Critical" value={severityCounts.critical} tone="red" />
        <MetricCard label="Warning" value={severityCounts.warning} tone="yellow" />
        <MetricCard label="Info" value={severityCounts.info} tone="blue" />
      </div>

      <SectionCard title="Incident Queue" subtitle="Severity-first triage for rapid response">
        <FilterBar>
          {(['all', 'critical', 'warning', 'info'] as const).map((s) => (
            <button key={s} onClick={() => setSeverityFilter(s)} className={`rounded-lg px-3 py-1.5 text-sm ${severityFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{s}</button>
          ))}
        </FilterBar>

        {loading ? (
          <p className="text-sm text-slate-500">Loading events…</p>
        ) : events.length === 0 ? (
          <EmptyState title="No incidents found" description="No events match the selected filter." />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <IncidentPanel key={event.event_id} summary={event.metadata?.notes || JSON.stringify(event.metadata)} childName={event.child_name || 'System'} status={<StatusBadge tone={tone(event.severity)}>{event.severity}</StatusBadge>} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
