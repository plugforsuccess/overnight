'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { EmptyState, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

export default function OperationsConsolePage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/ops/dashboard', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await res.json();
      if (!res.ok) return setError(payload.error || 'Failed to load operations dashboard');
      setData(payload);
    }
    load();
  }, []);

  const cards = [
    ['Children In Care', data?.childrenInCare],
    ['Expected Arrivals', data?.expectedArrivals],
    ['Ready for Pickup', data?.readyForPickup],
    ['Pickup Verification Queue', data?.pickupVerificationQueue],
    ['Open Incident Alerts', data?.openIncidents],
    ['Active Staff', data?.activeShifts],
    ['Open Tasks', data?.openTasks],
    ['Shift Handoff Notes', data?.handoffNotes],
  ];

  return (
    <div>
      <PageHeader title="Operations Console" subtitle="Live center control room for tonight's care execution" actions={<StatusBadge tone="blue">Live feed</StatusBadge>} />
      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-rose-700">{error}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map(([title, items]) => (
          <SectionCard key={title as string} title={title as string} subtitle={`${Array.isArray(items) ? items.length : 0} records`}>
            {Array.isArray(items) && items.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {items.slice(0, 6).map((item: any) => (
                  <li key={item.id ?? JSON.stringify(item)} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">{item.child_name || item.staff_name || item.note || item.description || JSON.stringify(item)}</li>
                ))}
              </ul>
            ) : (
              <EmptyState title={`No ${String(title).toLowerCase()}`} description="Queue is currently clear." />
            )}
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
