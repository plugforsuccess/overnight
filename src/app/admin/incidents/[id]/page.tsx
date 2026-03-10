'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { IncidentPanel, PageHeader, SectionCard, StatusBadge, Timeline, TimelineItem } from '@/components/ui/system';

export default function AdminIncidentCaseFilePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/incidents/${params.id}/case-file`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await res.json();
      if (res.ok) setData(payload);
    };
    load();
  }, [params.id]);

  return (
    <div className="space-y-4">
      <PageHeader title="Incident Case File" subtitle={`Case #${params.id}`} actions={<StatusBadge tone="red">Compliance-sensitive</StatusBadge>} />
      {!data ? <SectionCard title="Loading case file"><p className="text-sm text-slate-500">Fetching incident details…</p></SectionCard> : (
        <>
          <IncidentPanel
            summary={data.case_file?.summary || data.incident?.description || 'No summary provided.'}
            childName={data.incident?.child_name}
            status={<StatusBadge tone={data.case_file?.status === 'RESOLVED' ? 'green' : 'yellow'}>{data.case_file?.status || 'OPEN'}</StatusBadge>}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Case details">
              <p className="text-sm text-slate-700">Parent notified: {data.case_file?.parent_notified_at ? 'Yes' : 'No'}</p>
              <p className="text-sm text-slate-700">Parent acknowledged: {data.case_file?.parent_acknowledged_at ? 'Yes' : 'No'}</p>
              <p className="mt-2 text-sm text-slate-700">Actions taken: {data.case_file?.actions_taken || 'Pending documentation'}</p>
              <p className="mt-2 text-sm text-slate-700">Resolution summary: {data.case_file?.resolution_summary || 'Not resolved yet'}</p>
            </SectionCard>
            <SectionCard title="Timeline of related events">
              <Timeline>
                {(data.timeline || []).map((event: any) => (
                  <TimelineItem key={event.id} title={event.title || event.event_type || 'Event'} time={event.created_at} description={event.notes || event.description} tone={event.event_type?.includes('RESOLV') ? 'green' : 'blue'} />
                ))}
              </Timeline>
            </SectionCard>
          </div>
          <SectionCard title="Internal notes">
            <pre className="whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(data.notes || data.case_notes || [], null, 2)}</pre>
          </SectionCard>
        </>
      )}
    </div>
  );
}
