'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { IncidentPanel, PageHeader, SectionCard, StatusBadge, Timeline, TimelineItem } from '@/components/ui/system';

export default function DashboardIncidentPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/dashboard/incidents/${params.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) setData(await res.json());
  };

  useEffect(() => { load(); }, [params.id]);

  const acknowledge = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/dashboard/incidents/${params.id}/acknowledge`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
    if (res.ok) load();
  };

  if (!data) return <div className="p-6">Loading incident…</div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Incident update" subtitle="Clear, parent-safe summary and acknowledgement" />
      <IncidentPanel summary={data.incident.summary} status={<StatusBadge tone={data.caseFile.status === 'RESOLVED' ? 'green' : 'yellow'}>{data.caseFile.status}</StatusBadge>} />
      <SectionCard title="Case status">
        <p className="text-sm text-slate-700">Acknowledged: {String(data.caseFile.parent_acknowledged)}</p>
        {!data.caseFile.parent_acknowledged && <button className="btn-primary mt-3" onClick={acknowledge}>Acknowledge Incident</button>}
      </SectionCard>
      <SectionCard title="Timeline">
        <Timeline>
          {data.timeline.map((t: any) => <TimelineItem key={t.id} title={t.event_type} time={t.created_at} tone="blue" />)}
        </Timeline>
      </SectionCard>
      <SectionCard title="Guidance"><p className="text-sm text-slate-700">{data.guidance}</p></SectionCard>
    </div>
  );
}
