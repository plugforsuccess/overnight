'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';

export default function AdminChildTimelinePage() {
  const params = useParams<{ id: string }>();
  const childId = params.id;
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/children/${childId}/timeline`, {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const data = await res.json();
      if (res.ok) setEvents(data.events || []);
    }
    if (childId) load();
  }, [childId]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/admin/safety" className="text-sm text-blue-600">← Back to Safety</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">Child Timeline</h1>
      <div className="card space-y-3">
        {events.map((e) => (
          <div key={e.id} className="border-b border-gray-100 pb-2">
            <div className="font-medium">{e.event_summary || String(e.event_type).replaceAll('_', ' ')}</div>
            <div className="text-sm text-gray-500">{new Date(e.created_at).toLocaleString()} • {e.actor_label || e.actor_type}</div>
          </div>
        ))}
        {events.length === 0 && <div className="text-sm text-gray-500">No events yet.</div>}
      </div>
    </div>
  );
}
