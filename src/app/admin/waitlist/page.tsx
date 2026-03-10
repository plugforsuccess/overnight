'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatDate } from '@/lib/utils';
import { WaitlistEntry } from '@/types/database';
import { ActionBar, EmptyState, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

export default function AdminWaitlistPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data } = await supabase
        .from('waitlist')
        .select('*, child:children(*), parent:parents(*)')
        .in('status', ['waiting', 'offered'])
        .order('date')
        .order('created_at');

      if (data) setEntries(data);
      setLoading(false);
    }
    load();
  }, [router]);

  async function promoteEntry(entry: WaitlistEntry) {
    const { data: block } = await supabase.from('overnight_blocks').select('id').eq('child_id', entry.child_id).eq('parent_id', entry.parent_id).eq('status', 'active').limit(1).single();
    if (!block) return;
    await supabase.from('reservations').insert({ child_id: entry.child_id, overnight_block_id: block.id, date: entry.date, status: 'confirmed' });
    await supabase.from('waitlist').update({ status: 'accepted' }).eq('id', entry.id);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  async function offerSpot(entry: WaitlistEntry) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    await supabase.from('waitlist').update({ status: 'offered', offered_at: new Date().toISOString(), expires_at: expiresAt.toISOString() }).eq('id', entry.id);
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'offered' as const, offered_at: new Date().toISOString(), expires_at: expiresAt.toISOString() } : e)));
  }

  async function cancelEntry(id: string) {
    await supabase.from('waitlist').update({ status: 'removed' }).eq('id', id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader title="Waitlist Queue" subtitle="Prioritize requests and promote children into open capacity" />
      <SectionCard title="Active Waitlist" subtitle={`${entries.length} entries needing action`}>
        {entries.length === 0 ? (
          <EmptyState title="Waitlist is clear" description="No children are currently waiting for placement." />
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{entry.child?.first_name} {entry.child?.last_name}</p>
                    <p className="text-xs text-slate-500">Requested night: {formatDate(entry.date)} · Parent: {entry.parent?.first_name} {entry.parent?.last_name}</p>
                  </div>
                  <StatusBadge tone={entry.status === 'offered' ? 'yellow' : 'blue'}>{entry.status}</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.status === 'waiting' && <button onClick={() => offerSpot(entry)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-700">Offer 24h hold</button>}
                  <button onClick={() => promoteEntry(entry)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm text-emerald-700">Promote to reservation</button>
                  <button onClick={() => cancelEntry(entry.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-sm text-rose-700">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <ActionBar>
        <p className="text-sm text-slate-600">Prioritize <strong>offered</strong> entries before expiration, then promote by urgency.</p>
      </ActionBar>
    </div>
  );
}
