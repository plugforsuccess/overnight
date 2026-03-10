'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function DashboardIncidentPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/dashboard/incidents/${params.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setData(await res.json());
  };

  useEffect(() => { load(); }, [params.id]);

  const acknowledge = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/dashboard/incidents/${params.id}/acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) load();
  };

  if (!data) return <div className="p-6">Loading incident…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Incident Summary</h1>
      <p>{data.incident.summary}</p>
      <p>Status: {data.caseFile.status}</p>
      <p>Acknowledged: {String(data.caseFile.parent_acknowledged)}</p>

      {!data.caseFile.parent_acknowledged && (
        <button className="btn-primary" onClick={acknowledge}>Acknowledge Incident</button>
      )}

      <h2 className="font-semibold">Timeline</h2>
      <ul>{data.timeline.map((t: any) => <li key={t.id}>{t.event_type}</li>)}</ul>

      <p>{data.guidance}</p>
    </div>
  );
}
