'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ArrowUpCircle, Bell, XCircle, Users, Clock, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { useAdminRole } from '@/lib/admin-role-context';
import { DEFAULT_CAPACITY } from '@/lib/constants';
import { cn, formatDate } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { AdminSettings, WaitlistEntry } from '@/types/database';

interface WaitlistGroup {
  date: string;
  entries: WaitlistEntry[];
  confirmedCount: number;
  capacity: number;
}

export default function WaitlistOpsPage() {
  const router = useRouter();
  const { role } = useAdminRole();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [capacityCounts, setCapacityCounts] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);

  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      if (!['owner', 'admin', 'manager'].includes(role)) { router.push('/admin'); return; }

      const { data: s } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (s) setSettings(s as AdminSettings);

      // Fetch waitlist entries with child + parent
      const { data } = await supabase
        .from('waitlist')
        .select('*, child:children(id, first_name, last_name), parent:parents(id, first_name, last_name, phone)')
        .in('status', ['waiting', 'offered'])
        .order('date')
        .order('created_at');

      const waitlistData = data || [];
      setEntries(waitlistData);

      // Fetch confirmed reservation counts for the dates in the waitlist
      const dates = Array.from(new Set(waitlistData.map((e: WaitlistEntry) => e.date)));
      if (dates.length > 0) {
        const { data: reservations } = await supabase
          .from('reservations')
          .select('date')
          .in('date', dates)
          .eq('status', 'confirmed');

        const counts: Record<string, number> = {};
        dates.forEach(d => counts[d] = 0);
        (reservations || []).forEach((r: { date: string }) => {
          counts[r.date] = (counts[r.date] || 0) + 1;
        });
        setCapacityCounts(counts);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  // Group entries by date
  const groups: WaitlistGroup[] = useMemo(() => {
    const byDate: Record<string, WaitlistEntry[]> = {};
    entries.forEach(e => {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => ({
        date,
        entries,
        confirmedCount: capacityCounts[date] || 0,
        capacity,
      }));
  }, [entries, capacityCounts, capacity]);

  async function promoteEntry(entry: WaitlistEntry) {
    setPromoting(entry.id);
    try {
      const { data: block } = await supabase
        .from('overnight_blocks')
        .select('id')
        .eq('child_id', entry.child_id)
        .eq('parent_id', entry.parent_id)
        .eq('status', 'active')
        .limit(1)
        .single();

      if (!block) {
        alert('No active booking found for this child. Cannot promote.');
        return;
      }

      await supabase.from('reservations').insert({
        child_id: entry.child_id,
        overnight_block_id: block.id,
        date: entry.date,
        status: 'confirmed',
      });

      await supabase.from('waitlist').update({ status: 'accepted' }).eq('id', entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      setCapacityCounts(prev => ({ ...prev, [entry.date]: (prev[entry.date] || 0) + 1 }));
    } finally {
      setPromoting(null);
    }
  }

  async function offerSpot(entry: WaitlistEntry) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await supabase.from('waitlist').update({
      status: 'offered',
      offered_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    }).eq('id', entry.id);

    setEntries(prev => prev.map(e =>
      e.id === entry.id ? { ...e, status: 'offered' as const, offered_at: new Date().toISOString(), expires_at: expiresAt.toISOString() } : e
    ));
  }

  async function removeEntry(id: string) {
    await supabase.from('waitlist').update({ status: 'removed' }).eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const totalWaiting = entries.filter(e => e.status === 'waiting').length;
  const totalOffered = entries.filter(e => e.status === 'offered').length;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Waitlist Queue</h1>
            <p className="text-gray-500">{entries.length} total entries across {groups.length} night{groups.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card text-center">
            <Clock className="h-6 w-6 text-amber-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-amber-700">{totalWaiting}</div>
            <div className="text-xs text-gray-500">Waiting</div>
          </div>
          <div className="card text-center">
            <Bell className="h-6 w-6 text-blue-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-blue-700">{totalOffered}</div>
            <div className="text-xs text-gray-500">Offers sent</div>
          </div>
          <div className="card text-center">
            <Users className="h-6 w-6 text-navy-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-navy-800">{groups.length}</div>
            <div className="text-xs text-gray-500">Nights with demand</div>
          </div>
        </div>

        {/* Grouped by date */}
        {groups.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 text-lg">No one on the waitlist right now.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(group => {
              const spotsLeft = group.capacity - group.confirmedCount;
              const pressure = group.entries.length / Math.max(spotsLeft, 1);
              const isFull = spotsLeft <= 0;

              return (
                <div key={group.date} className="card">
                  {/* Date header with capacity context */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-navy-100 flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-semibold text-navy-600 leading-none uppercase">
                          {format(parseISO(group.date), 'MMM')}
                        </span>
                        <span className="text-lg font-bold text-navy-800 leading-tight">
                          {format(parseISO(group.date), 'd')}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{format(parseISO(group.date), 'EEEE')}</div>
                        <div className="text-sm text-gray-500">
                          {group.confirmedCount}/{group.capacity} confirmed &middot;{' '}
                          <span className={cn(
                            'font-medium',
                            isFull ? 'text-red-600' : spotsLeft <= 2 ? 'text-amber-600' : 'text-green-600',
                          )}>
                            {isFull ? 'Full' : `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} open`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Demand pressure indicator */}
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border',
                        pressure >= 3 ? 'bg-red-50 text-red-700 border-red-200' :
                        pressure >= 1.5 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-gray-50 text-gray-600 border-gray-200',
                      )}>
                        <TrendingUp className="h-3 w-3" />
                        {group.entries.length} waiting
                      </span>
                    </div>
                  </div>

                  {/* Queue entries */}
                  <div className="space-y-2">
                    {group.entries.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-xl border transition-colors',
                          entry.status === 'offered' ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50 border-gray-100',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-400 w-6 text-right">#{idx + 1}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {entry.child?.first_name} {entry.child?.last_name}
                              </span>
                              {entry.status === 'offered' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                  <Bell className="h-2.5 w-2.5" /> Offer sent
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {entry.parent?.first_name} {entry.parent?.last_name}
                              {entry.parent?.phone && ` \u2022 ${entry.parent.phone}`}
                            </div>
                            {entry.status === 'offered' && entry.expires_at && (
                              <div className="text-xs text-blue-600 mt-0.5">
                                Expires {formatDate(entry.expires_at)}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {entry.status === 'waiting' && (
                            <button
                              onClick={() => offerSpot(entry)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Send offer"
                            >
                              <Bell className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => promoteEntry(entry)}
                            disabled={promoting === entry.id}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                            title="Promote to confirmed"
                          >
                            <ArrowUpCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeEntry(entry.id)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                            title="Remove from waitlist"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
