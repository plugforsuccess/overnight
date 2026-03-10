'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_CAPACITY, DEFAULT_OPERATING_NIGHTS, DAY_LABELS } from '@/lib/constants';
import { getWeekNights, getCurrentWeekStart } from '@/lib/utils';
import { Reservation, AdminSettings, DayOfWeek, OvernightBlock, Profile } from '@/types/database';
import { format, addDays } from 'date-fns';
import { ChildCard, EmptyState, FilterBar, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

export default function RosterPage() {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = addDays(getCurrentWeekStart(), weekOffset * 7);
  const operatingNights = (settings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];
  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;
  const weekNights = getWeekNights(weekStart, operatingNights);

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }
      const { data: s } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (s) setSettings(s as AdminSettings);
      setLoading(false);
    }
    load();
  }, [router]);

  useEffect(() => {
    if (!selectedDate) return;
    async function loadRoster() {
      const res = await fetch(`/api/admin?view=roster&date=${selectedDate}`, { headers: await getAuthHeaders() });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load roster');
      setReservations(payload.reservations || []);
    }
    loadRoster();
  }, [selectedDate]);

  useEffect(() => {
    if (weekNights.length > 0 && !selectedDate) setSelectedDate(weekNights[0].dateStr);
  }, [weekNights, selectedDate]);

  async function cancelReservation(id: string) {
    if (!confirm('Cancel this reservation?')) return;
    await fetch('/api/admin', { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ action: 'cancel_reservation', reservationId: id }) });
    setReservations((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Nightly Roster" subtitle={`Week of ${format(weekStart, 'MMM d, yyyy')} · ${reservations.length}/${capacity} assigned`} actions={<div className="flex gap-2"><button onClick={() => { setWeekOffset((w) => w - 1); setSelectedDate(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Previous</button><button onClick={() => { setWeekOffset((w) => w + 1); setSelectedDate(''); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Next</button></div>} />
      <SectionCard title="Night Filters">
        <FilterBar>
          {weekNights.map(({ day, dateStr }) => (
            <button key={dateStr} onClick={() => setSelectedDate(dateStr)} className={`rounded-lg px-3 py-1.5 text-sm ${selectedDate === dateStr ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{DAY_LABELS[day]} {dateStr.slice(5)}</button>
          ))}
        </FilterBar>
        <StatusBadge tone={reservations.length >= capacity ? 'red' : 'green'}>{reservations.length >= capacity ? 'full' : `${capacity - reservations.length} spots available`}</StatusBadge>
      </SectionCard>

      <SectionCard title="Child Roster" subtitle="Child-centric scan view for operations">
        {reservations.length === 0 ? <EmptyState title="No reservations for this night" description="Children will appear here once reservations are confirmed." /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {reservations.map((r) => {
              const child = r.child;
              const block = r.overnight_block as OvernightBlock & { parent?: Profile } | undefined;
              const parent = block?.parent;
              return (
                <ChildCard
                  key={r.id}
                  name={`${child?.first_name || 'Child'} ${child?.last_name || ''}`}
                  status={<StatusBadge tone="blue">{r.status}</StatusBadge>}
                  details={<div className="space-y-1 text-xs"><p>Parent: {parent?.first_name || '—'} {parent?.last_name || ''}</p><p>Booking: {block?.id ? 'assigned' : '—'}</p><button onClick={() => cancelReservation(r.id)} className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">Cancel reservation</button></div>}
                />
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
