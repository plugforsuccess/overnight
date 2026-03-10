'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_CAPACITY, DEFAULT_OPERATING_NIGHTS, DAY_LABELS } from '@/lib/constants';
import { getWeekNights, getCurrentWeekStart, formatWeekRange } from '@/lib/utils';
import { DayOfWeek, AdminSettings } from '@/types/database';
import { addDays } from 'date-fns';
import { AlertCard, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

interface NightData { dateStr: string; day: DayOfWeek; confirmed: number; waitlisted: number; capacity: number; }
interface WeekData { weekStart: Date; nights: NightData[]; avgUtilization: number; }

export default function CapacityPlannerPage() {
  const router = useRouter();
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [startOffset, setStartOffset] = useState(0);

  const WEEKS_TO_SHOW = 4;

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
    if (loading) return;
    async function loadCapacity() {
      const currentCapacity = settings?.max_capacity ?? DEFAULT_CAPACITY;
      const currentNights = (settings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];
      const baseWeekStart = addDays(getCurrentWeekStart(), startOffset * 7);
      const allDates: string[] = [];
      const weekStarts: Date[] = [];
      for (let i = 0; i < WEEKS_TO_SHOW; i++) {
        const ws = addDays(baseWeekStart, i * 7);
        weekStarts.push(ws);
        allDates.push(...getWeekNights(ws, currentNights).map((n) => n.dateStr));
      }

      const [confirmedRes, waitlistRes] = await Promise.all([
        supabase.from('reservations').select('date').in('date', allDates).eq('status', 'confirmed'),
        supabase.from('waitlist').select('date').in('date', allDates).in('status', ['waiting', 'offered']),
      ]);

      const confirmedCounts: Record<string, number> = {};
      const waitlistCounts: Record<string, number> = {};
      allDates.forEach((d) => { confirmedCounts[d] = 0; waitlistCounts[d] = 0; });
      (confirmedRes.data || []).forEach((r: { date: string }) => { confirmedCounts[r.date] += 1; });
      (waitlistRes.data || []).forEach((r: { date: string }) => { waitlistCounts[r.date] += 1; });

      setWeeks(weekStarts.map((ws) => {
        const nights = getWeekNights(ws, currentNights).map((n) => ({ dateStr: n.dateStr, day: n.day, confirmed: confirmedCounts[n.dateStr] || 0, waitlisted: waitlistCounts[n.dateStr] || 0, capacity: currentCapacity }));
        const avgUtilization = nights.length ? (nights.reduce((sum, n) => sum + (n.confirmed / n.capacity), 0) / nights.length) * 100 : 0;
        return { weekStart: ws, nights, avgUtilization };
      }));
    }
    loadCapacity();
  }, [loading, settings, startOffset]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const allNights = weeks.flatMap((w) => w.nights);
  const fullNights = allNights.filter((n) => n.confirmed >= n.capacity).length;
  const totalWaitlisted = allNights.reduce((s, n) => s + n.waitlisted, 0);
  const overallUtilization = allNights.length ? Math.round((allNights.reduce((s, n) => s + (n.confirmed / n.capacity), 0) / allNights.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Capacity Planner" subtitle="Beds used, availability, and forecast pressure" actions={<div className="flex gap-2"><button onClick={() => setStartOffset((o) => o - WEEKS_TO_SHOW)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Previous</button><button onClick={() => setStartOffset(0)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Today</button><button onClick={() => setStartOffset((o) => o + WEEKS_TO_SHOW)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Next</button></div>} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Avg Utilization" value={`${overallUtilization}%`} tone={overallUtilization > 85 ? 'yellow' : 'green'} />
        <MetricCard label="Full Nights" value={fullNights} tone={fullNights > 0 ? 'red' : 'green'} />
        <MetricCard label="Waitlisted" value={totalWaitlisted} tone={totalWaitlisted > 0 ? 'yellow' : 'green'} />
      </div>
      {(overallUtilization > 90 || totalWaitlisted > 0) && <AlertCard tone={overallUtilization > 90 ? 'red' : 'yellow'} title="Capacity pressure">Forecast indicates elevated occupancy and waitlist pressure; prioritize promotions and staffing.</AlertCard>}

      <SectionCard title="Weekly Capacity Forecast">
        <div className="space-y-4">
          {weeks.map((week) => (
            <div key={week.weekStart.toISOString()} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium text-slate-900">Week of {formatWeekRange(week.weekStart)}</p>
                <StatusBadge tone={week.avgUtilization > 90 ? 'red' : week.avgUtilization > 75 ? 'yellow' : 'green'}>{Math.round(week.avgUtilization)}% utilized</StatusBadge>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {week.nights.map((night) => (
                  <div key={night.dateStr} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
                    <p className="font-medium text-slate-800">{DAY_LABELS[night.day]}</p>
                    <p className="text-xs text-slate-500">{night.dateStr}</p>
                    <p className="mt-1 text-slate-700">{night.confirmed}/{night.capacity} beds</p>
                    {night.waitlisted > 0 && <StatusBadge tone="yellow">+{night.waitlisted} waiting</StatusBadge>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
