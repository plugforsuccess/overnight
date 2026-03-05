'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Users, DollarSign, Clock, Settings, List, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatCents, DEFAULT_CAPACITY, DEFAULT_OPERATING_NIGHTS, DAY_LABELS } from '@/lib/constants';
import { getWeekNights, getCurrentWeekStart } from '@/lib/utils';
import { DayOfWeek, AdminSettings } from '@/types/database';

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState({ activePlansCount: 0, totalChildren: 0, weeklyRevenue: 0 });
  const [nightCounts, setNightCounts] = useState<Record<string, { day: DayOfWeek; count: number }>>({});
  const [paymentStats, setPaymentStats] = useState({ succeeded: 0, pending: 0, failed: 0 });
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;
  const operatingNights = (settings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      // Fetch settings
      const { data: s } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (s) setSettings(s as AdminSettings);

      const currentCapacity = s?.max_capacity ?? DEFAULT_CAPACITY;
      const currentNights = (s?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];

      // Fetch stats
      const [plansRes, childrenRes, waitlistRes] = await Promise.all([
        supabase.from('plans').select('price_cents').eq('status', 'active'),
        supabase.from('children').select('id', { count: 'exact', head: true }),
        supabase.from('waitlist').select('id', { count: 'exact', head: true }).in('status', ['waiting', 'offered']),
      ]);

      setStats({
        activePlansCount: plansRes.data?.length ?? 0,
        totalChildren: childrenRes.count ?? 0,
        weeklyRevenue: plansRes.data?.reduce((s, p) => s + p.price_cents, 0) ?? 0,
      });
      setWaitlistCount(waitlistRes.count ?? 0);

      // Fetch capacity for current week nights
      const weekStart = getCurrentWeekStart();
      const weekNights = getWeekNights(weekStart, currentNights);
      const nightDates = weekNights.map(n => n.dateStr);

      const { data: reservations } = await supabase
        .from('reservations')
        .select('night_date')
        .in('night_date', nightDates)
        .eq('status', 'confirmed');

      const counts: Record<string, { day: DayOfWeek; count: number }> = {};
      weekNights.forEach(n => counts[n.dateStr] = { day: n.day, count: 0 });
      reservations?.forEach(r => {
        if (counts[r.night_date]) {
          counts[r.night_date].count += 1;
        }
      });
      setNightCounts(counts);

      // Fetch payment stats
      const [succeededRes, pendingRes, failedRes] = await Promise.all([
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'succeeded'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ]);
      setPaymentStats({
        succeeded: succeededRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        failed: failedRes.count ?? 0,
      });

      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 mb-8">Manage your DreamWatch Overnight program</p>

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-4 mb-8">
          <div className="card flex items-center gap-3">
            <Users className="h-8 w-8 text-navy-600" />
            <div>
              <div className="text-2xl font-bold">{stats.activePlansCount}</div>
              <div className="text-sm text-gray-500">Active Plans</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Users className="h-8 w-8 text-navy-700" />
            <div>
              <div className="text-2xl font-bold">{stats.totalChildren}</div>
              <div className="text-sm text-gray-500">Total Children</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold">{formatCents(stats.weeklyRevenue)}</div>
              <div className="text-sm text-gray-500">Weekly Revenue</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold">{waitlistCount}</div>
              <div className="text-sm text-gray-500">Waitlisted</div>
            </div>
          </div>
        </div>

        {/* Capacity View — This Week */}
        <div className="card mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">This Week&apos;s Capacity</h2>
          <div className="grid grid-cols-5 gap-4">
            {Object.entries(nightCounts).map(([dateStr, { day, count }]) => {
              const remaining = capacity - count;
              const isFull = remaining <= 0;
              const fillPct = Math.min((count / capacity) * 100, 100);
              return (
                <div key={dateStr} className="text-center">
                  <div className="text-sm font-bold text-gray-900 mb-1">{DAY_LABELS[day]}</div>
                  <div className="text-xs text-gray-400 mb-2">{dateStr.slice(5)}</div>
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div
                      className={`h-3 rounded-full transition-all ${isFull ? 'bg-red-500' : count > capacity * 0.7 ? 'bg-yellow-500' : 'bg-green-500'}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <div className={`text-sm font-semibold ${isFull ? 'text-red-600' : 'text-gray-700'}`}>
                    {count}/{capacity}
                  </div>
                  {isFull && <div className="text-xs text-red-500 font-medium">Full</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Payments Status */}
        <div className="card mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Payments Overview</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{paymentStats.succeeded}</div>
              <div className="text-sm text-green-600">Succeeded</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-700">{paymentStats.pending}</div>
              <div className="text-sm text-yellow-600">Pending</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-700">{paymentStats.failed}</div>
              <div className="text-sm text-red-600">Failed</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/roster" className="card hover:shadow-md transition-shadow text-center">
            <Calendar className="h-10 w-10 text-navy-700 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Nightly Roster</div>
            <div className="text-sm text-gray-500">View children by night</div>
          </Link>
          <Link href="/admin/plans" className="card hover:shadow-md transition-shadow text-center">
            <List className="h-10 w-10 text-navy-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Active Plans</div>
            <div className="text-sm text-gray-500">View & manage plans</div>
          </Link>
          <Link href="/admin/waitlist" className="card hover:shadow-md transition-shadow text-center">
            <Clock className="h-10 w-10 text-yellow-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Waitlist</div>
            <div className="text-sm text-gray-500">Manage waitlisted families</div>
          </Link>
          <Link href="/admin/settings" className="card hover:shadow-md transition-shadow text-center">
            <Settings className="h-10 w-10 text-gray-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Settings</div>
            <div className="text-sm text-gray-500">Capacity, pricing, hours</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
