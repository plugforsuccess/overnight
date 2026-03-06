'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, UserX, Phone, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_CAPACITY, DEFAULT_OPERATING_NIGHTS, DAY_LABELS } from '@/lib/constants';
import { getWeekNights, getCurrentWeekStart, cn } from '@/lib/utils';
import { Reservation, AdminSettings, DayOfWeek } from '@/types/database';
import { format, addDays, subDays } from 'date-fns';

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
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
      const { data } = await supabase
        .from('reservations')
        .select('*, child:children(*), parent:profiles(*)')
        .eq('night_date', selectedDate)
        .eq('status', 'confirmed');
      setReservations(data || []);
    }
    loadRoster();
  }, [selectedDate]);

  // Auto-select first night of current week
  useEffect(() => {
    if (weekNights.length > 0 && !selectedDate) {
      setSelectedDate(weekNights[0].dateStr);
    }
  }, [weekNights, selectedDate]);

  async function cancelReservation(id: string) {
    if (!confirm('Cancel this reservation?')) return;
    await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', id);
    setReservations(prev => prev.filter(r => r.id !== id));
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-3xl font-bold text-gray-900">Nightly Roster</h1>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => { setWeekOffset(w => w - 1); setSelectedDate(''); }} className="btn-secondary flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" /> Previous Week
          </button>
          <span className="font-semibold text-gray-900">
            Week of {format(weekStart, 'MMM d, yyyy')}
          </span>
          <button onClick={() => { setWeekOffset(w => w + 1); setSelectedDate(''); }} className="btn-secondary flex items-center gap-1">
            Next Week <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Night Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {weekNights.map(({ day, dateStr }) => (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={cn(
                'px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors',
                selectedDate === dateStr ? 'bg-navy-700 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              )}
            >
              {DAY_LABELS[day]}<br />
              <span className="text-xs">{dateStr}</span>
            </button>
          ))}
        </div>

        {/* Roster */}
        {selectedDate && (
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {selectedDate} — {reservations.length}/{capacity} children
              </h2>
              <span className={reservations.length >= capacity ? 'badge-red' : 'badge-green'}>
                {reservations.length >= capacity ? 'Full' : `${capacity - reservations.length} spots available`}
              </span>
            </div>

            {reservations.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">No reservations for this night.</p>
            ) : (
              <div className="space-y-4">
                {reservations.map(r => {
                  const child = r.child;
                  const parent = r.parent;
                  return (
                    <div key={r.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-gray-900 text-lg">{child?.first_name} {child?.last_name}</h3>
                          <p className="text-sm text-gray-500">DOB: {child?.date_of_birth}</p>
                        </div>
                        <button onClick={() => cancelReservation(r.id)} className="text-red-500 hover:text-red-700 p-1" title="Cancel reservation">
                          <UserX className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
                        <div>
                          <span className="text-gray-500">Parent:</span>{' '}
                          <span className="text-gray-900">{parent?.first_name} {parent?.last_name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-900">{parent?.phone || 'N/A'}</span>
                        </div>
                        {child?.allergies && (
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" />
                            Allergies: {child.allergies}
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Emergency:</span>{' '}
                          <span className="text-gray-900">{child?.emergency_contact_name} ({child?.emergency_contact_phone})</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Authorized Pickup:</span>{' '}
                          <span className="text-gray-900">{child?.authorized_pickup}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
