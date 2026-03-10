'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';

export default function OperationsConsolePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/ops/dashboard', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error || 'Failed to load operations dashboard');
        return;
      }
      setData(payload);
    }
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Operations Console</h1>
      {error && <div className="text-red-600">{error}</div>}
      {!data ? <div className="card p-4">Loading...</div> : (
        <div className="grid md:grid-cols-2 gap-4">
          <Section title="Children in Care" items={data.childrenInCare} />
          <Section title="Expected Arrivals" items={data.expectedArrivals} />
          <Section title="Ready for Pickup" items={data.readyForPickup} />
          <Section title="Pickup Verification Queue" items={data.pickupVerificationQueue} />
          <Section title="Open Incidents" items={data.openIncidents} />
          <Section title="Active Shift Roster" items={data.activeShifts} />
          <Section title="Shift Handoff Notes" items={data.handoffNotes} />
          <Section title="Open Tasks" items={data.openTasks} />
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {items?.length ? (
        <ul className="text-sm space-y-2">
          {items.slice(0, 8).map((item: any) => (
            <li key={item.id} className="border-b border-gray-100 pb-2">{JSON.stringify(item)}</li>
          ))}
        </ul>
      ) : <p className="text-sm text-gray-500">No items</p>}
    </div>
  );
}
