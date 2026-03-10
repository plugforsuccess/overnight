'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCents } from '@/lib/constants';
import { MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

interface RevenuePayload {
  monthlyRevenueCents: number;
  activePlans: number;
  unpaidBalances: number;
  recent: { id: string; amount_cents: number; status: string; created_at: string }[];
}

function tone(status: string): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  if (status === 'succeeded') return 'green';
  if (status === 'pending') return 'yellow';
  if (status === 'failed') return 'red';
  return 'gray';
}

export default function AdminRevenuePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RevenuePayload>({ monthlyRevenueCents: 0, activePlans: 0, unpaidBalances: 0, recent: [] });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/revenue', { headers: { Authorization: `Bearer ${sessionData.session?.access_token || ''}` } });
      if (res.ok) setData(await res.json());
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Operations" subtitle="Monthly revenue, plans, and unpaid balance monitoring" />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Monthly Revenue" value={formatCents(data.monthlyRevenueCents)} tone="green" />
        <MetricCard label="Active Plans" value={data.activePlans} tone="blue" />
        <MetricCard label="Unpaid Balances" value={data.unpaidBalances} tone={data.unpaidBalances > 0 ? 'red' : 'green'} />
      </div>

      <SectionCard title="Recent Billing Activity">
        <div className="space-y-3">
          {data.recent.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div className="text-sm text-slate-600">{new Date(row.created_at).toLocaleDateString()}</div>
              <div className="font-medium text-slate-900">{formatCents(row.amount_cents)}</div>
              <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
            </div>
          ))}
          {data.recent.length === 0 && <p className="text-sm text-slate-500">No recent billing records available.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
