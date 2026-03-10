'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { OVERNIGHT_END, OVERNIGHT_START } from '@/lib/constants';
import { EmptyState, FilterBar, MetricCard, PageHeader, ReservationStatusCard, SectionCard, StatusBadge } from '@/components/ui/system';

type ReservationRow = {
  id: string;
  status: string;
  date: string;
  created_at: string;
  overnight_blocks?: {
    child?: { first_name: string; last_name: string } | null;
  } | null;
};

function reservationTone(status: string): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  if (status === 'confirmed' || status === 'completed') return 'green';
  if (status === 'pending_payment') return 'yellow';
  if (status === 'cancelled' || status === 'no_show') return 'red';
  return 'blue';
}

export default function ReservationsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('reservations')
        .select('id,status,date,created_at,overnight_blocks(child:children(first_name,last_name),parent_id)')
        .eq('overnight_blocks.parent_id', user.id)
        .order('date', { ascending: true });

      if (data) setRows(data as unknown as ReservationRow[]);
      setLoading(false);
    }
    load();
  }, []);

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() => rows.filter((r) => r.date >= now), [rows, now]);
  const past = useMemo(() => rows.filter((r) => r.date < now).reverse(), [rows, now]);
  const activeList = tab === 'upcoming' ? upcoming : past;

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Reservations" subtitle="Upcoming nights and stay history" actions={<Link href="/schedule" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Book overnight</Link>} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Upcoming Nights" value={upcoming.length} tone="blue" />
        <MetricCard label="Past Reservations" value={past.length} tone="gray" />
        <MetricCard label="Needs Attention" value={rows.filter((r) => ['pending_payment'].includes(r.status)).length} tone="yellow" />
      </div>

      <SectionCard title="Reservation Queue">
        <FilterBar>
          <button onClick={() => setTab('upcoming')} className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'upcoming' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Upcoming Nights</button>
          <button onClick={() => setTab('past')} className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'past' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Past Reservations</button>
        </FilterBar>

        {activeList.length === 0 ? (
          <EmptyState title={tab === 'upcoming' ? 'No upcoming nights' : 'No past reservations'} description="Reservation activity will appear here as your bookings progress." action={tab === 'upcoming' ? <Link href="/schedule" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Book now</Link> : undefined} />
        ) : (
          <div className="space-y-3">
            {activeList.map((reservation) => (
              <ReservationStatusCard key={reservation.id} title={`${reservation.overnight_blocks?.child?.first_name || 'Child'} ${reservation.overnight_blocks?.child?.last_name || ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p className="text-slate-600">{new Date(`${reservation.date}T00:00:00`).toLocaleDateString()} · {OVERNIGHT_START}–{OVERNIGHT_END}</p>
                  <StatusBadge tone={reservationTone(reservation.status)}>{reservation.status.replace('_', ' ')}</StatusBadge>
                </div>
              </ReservationStatusCard>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
