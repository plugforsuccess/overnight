'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function AdminIncidentCaseFilePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/incidents/${params.id}/case-file`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setData(await res.json());
    };
    load();
  }, [params.id]);

  if (!data) return <div className="p-6">Loading case file…</div>;

  return (
    <div className="p-6 space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">Incident Case File</h1>
        <p>{data.incident.summary}</p>
      </section>

      <section>
        <h2 className="font-semibold">Child + Parent</h2>
        <p>{data.incident.child?.first_name} {data.incident.child?.last_name}</p>
        <p>{data.incident.child?.parent?.first_name} {data.incident.child?.parent?.last_name}</p>
      </section>

      <section>
        <h2 className="font-semibold">Case Status</h2>
        <p>{data.caseFile.status}</p>
        <p>Parent notified: {String(data.caseFile.parent_notified)}</p>
        <p>Parent acknowledged: {String(data.caseFile.parent_acknowledged)}</p>
      </section>

      <section>
        <h2 className="font-semibold">Internal Notes</h2>
        <ul>{data.notes.map((n: any) => <li key={n.id}>{n.note_type}: {n.note_body}</li>)}</ul>
      </section>

      <section>
        <h2 className="font-semibold">Actions Taken</h2>
        <ul>{data.actions.map((a: any) => <li key={a.id}>{a.action_label}</li>)}</ul>
      </section>

      <section>
        <h2 className="font-semibold">Related Timeline</h2>
        <ul>{data.careEvents.map((e: any) => <li key={e.id}>{e.event_type} — {new Date(e.created_at).toLocaleString()}</li>)}</ul>
      </section>

      <section>
        <h2 className="font-semibold">Resolution Summary</h2>
        <p>{data.caseFile.resolution_summary || 'Not resolved yet.'}</p>
      </section>
    </div>
  );
}
