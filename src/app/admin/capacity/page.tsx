'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { useAdminRole } from '@/lib/admin-role-context';
import { DEFAULT_CAPACITY, DEFAULT_OPERATING_NIGHTS, DAY_LABELS } from '@/lib/constants';
import { getWeekNights, getCurrentWeekStart, cn, formatWeekRange } from '@/lib/utils';
import { DayOfWeek, AdminSettings } from '@/types/database';
import { format, addDays } from 'date-fns';

interface NightData {
  dateStr: string;
  day: DayOfWeek;
  confirmed: number;
  waitlisted: number;
  capacity: number;
}

interface WeekData {
  weekStart: Date;
  nights: NightData[];
  avgUtilization: number;
}

export default function CapacityPlannerPage() {
  const router = useRouter();
  const { role } = useAdminRole();
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [startOffset, setStartOffset] = useState(0);

  const WEEKS_TO_SHOW = 4;
  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;
  const operatingNights = (settings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      if (!['owner', 'admin', 'manager'].includes(role)) { router.push('/admin'); return; }

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

      // Generate all dates for the 4-week window
      const allDates: string[] = [];
      const weekStarts: Date[] = [];
      for (let i = 0; i < WEEKS_TO_SHOW; i++) {
        const ws = addDays(baseWeekStart, i * 7);
        weekStarts.push(ws);
        const nights = getWeekNights(ws, currentNights);
        allDates.push(...nights.map(n => n.dateStr));
      }

      // Fetch confirmed and waitlisted counts in parallel
      const [confirmedRes, waitlistRes] = await Promise.all([
        supabase
          .from('reservations')
          .select('date')
          .in('date', allDates)
          .eq('status', 'confirmed'),
        supabase
          .from('waitlist')
          .select('date')
          .in('date', allDates)
          .in('status', ['waiting', 'offered']),
      ]);

      const confirmedCounts: Record<string, number> = {};
      const waitlistCounts: Record<string, number> = {};
      allDates.forEach(d => { confirmedCounts[d] = 0; waitlistCounts[d] = 0; });
      (confirmedRes.data || []).forEach((r: { date: string }) => {
        confirmedCounts[r.date] = (confirmedCounts[r.date] || 0) + 1;
      });
      (waitlistRes.data || []).forEach((r: { date: string }) => {
        waitlistCounts[r.date] = (waitlistCounts[r.date] || 0) + 1;
      });

      // Build week data
      const weekData: WeekData[] = weekStarts.map(ws => {
        const nights = getWeekNights(ws, currentNights).map(n => ({
          dateStr: n.dateStr,
          day: n.day,
          confirmed: confirmedCounts[n.dateStr] || 0,
          waitlisted: waitlistCounts[n.dateStr] || 0,
          capacity: currentCapacity,
        }));

        const totalUtil = nights.reduce((sum, n) => sum + (n.confirmed / n.capacity), 0);
        const avgUtilization = nights.length > 0 ? (totalUtil / nights.length) * 100 : 0;

        return { weekStart: ws, nights, avgUtilization };
      });

      setWeeks(weekData);
    }
    loadCapacity();
  }, [loading, settings, startOffset]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  // Compute overall stats
  const allNights: NightData[] = weeks.flatMap((w: WeekData) => w.nights);
  const fullNights = allNights.filter((n: NightData) => n.confirmed >= n.capacity).length;
  const lowNights = allNights.filter((n: NightData) => n.confirmed > 0 && n.confirmed < n.capacity * 0.5).length;
  const emptyNights = allNights.filter((n: NightData) => n.confirmed === 0).length;
  const totalWaitlisted = allNights.reduce((s: number, n: NightData) => s + n.waitlisted, 0);
  const overallUtilization = allNights.length > 0
    ? Math.round(allNights.reduce((s: number, n: NightData) => s + (n.confirmed / n.capacity), 0) / allNights.length * 100)
    : 0;

  function getBarColor(confirmed: number, cap: number): string {
    const pct = confirmed / cap;
    if (pct >= 1) return 'bg-red-500';
    if (pct >= 0.8) return 'bg-amber-500';
    if (pct >= 0.5) return 'bg-green-500';
    if (pct > 0) return 'bg-blue-400';
    return 'bg-gray-200';
  }

  function getCellBg(confirmed: number, cap: number): string {
    const pct = confirmed / cap;
    if (pct >= 1) return 'bg-red-50 border-red-200';
    if (pct >= 0.8) return 'bg-amber-50 border-amber-200';
    if (pct >= 0.5) return 'bg-green-50 border-green-200';
    return 'bg-white border-gray-200';
  }

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Capacity Planner</h1>
            <p className="text-gray-500">{WEEKS_TO_SHOW}-week view &middot; {capacity} beds/night</p>
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="card text-center py-3">
            <div className="text-2xl font-bold text-navy-800">{overallUtilization}%</div>
            <div className="text-xs text-gray-500">Avg utilization</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-2xl font-bold text-red-600">{fullNights}</div>
            <div className="text-xs text-gray-500">Full nights</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-2xl font-bold text-blue-600">{lowNights}</div>
            <div className="text-xs text-gray-500">Low enrollment</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-2xl font-bold text-gray-400">{emptyNights}</div>
            <div className="text-xs text-gray-500">Empty nights</div>
          </div>
          <div className="card text-center py-3">
            <div className="text-2xl font-bold text-amber-600">{totalWaitlisted}</div>
            <div className="text-xs text-gray-500">Waitlisted</div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setStartOffset((o: number) => o - WEEKS_TO_SHOW)}
            className="btn-secondary flex items-center gap-1 text-sm"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button
            onClick={() => setStartOffset(0)}
            className="text-sm font-medium text-accent-600 hover:text-accent-700"
          >
            Today
          </button>
          <button
            onClick={() => setStartOffset((o: number) => o + WEEKS_TO_SHOW)}
            className="btn-secondary flex items-center gap-1 text-sm"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Week-by-week grid */}
        <div className="space-y-6">
          {weeks.map((week: WeekData) => (
            <div key={week.weekStart.toISOString()} className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Week of {formatWeekRange(week.weekStart)}
                  </h2>
                  <div className="text-sm text-gray-500">
                    {Math.round(week.avgUtilization)}% avg utilization
                  </div>
                </div>
                {week.avgUtilization >= 90 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                    <TrendingUp className="h-3 w-3" /> High demand
                  </span>
                )}
                {week.avgUtilization < 30 && week.avgUtilization > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">
                    <AlertTriangle className="h-3 w-3" /> Low enrollment
                  </span>
                )}
              </div>

              <div className={cn(
                'grid gap-3',
                week.nights.length <= 5 ? `grid-cols-${week.nights.length}` : 'grid-cols-5',
              )} style={{ gridTemplateColumns: `repeat(${week.nights.length}, minmax(0, 1fr))` }}>
                {week.nights.map((night: NightData) => {
                  const pct = Math.round((night.confirmed / night.capacity) * 100);
                  const isFull = night.confirmed >= night.capacity;

                  return (
                    <div
                      key={night.dateStr}
                      className={cn(
                        'rounded-xl border p-3 text-center transition-colors',
                        getCellBg(night.confirmed, night.capacity),
                      )}
                    >
                      <div className="text-xs font-semibold text-gray-600 mb-0.5">
                        {DAY_LABELS[night.day].slice(0, 3)}
                      </div>
                      <div className="text-xs text-gray-400 mb-2">
                        {night.dateStr.slice(5)}
                      </div>

                      {/* Vertical fill bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                        <div
                          className={cn('h-2.5 rounded-full transition-all', getBarColor(night.confirmed, night.capacity))}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>

                      <div className={cn(
                        'text-lg font-bold',
                        isFull ? 'text-red-600' : night.confirmed === 0 ? 'text-gray-300' : 'text-gray-900',
                      )}>
                        {night.confirmed}/{night.capacity}
                      </div>

                      {isFull && (
                        <div className="text-[10px] font-bold text-red-500 uppercase">Full</div>
                      )}
                      {!isFull && night.confirmed === 0 && (
                        <div className="text-[10px] text-gray-400">Empty</div>
                      )}

                      {night.waitlisted > 0 && (
                        <div className="mt-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                          +{night.waitlisted} waiting
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-gray-200" /> Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-400" /> &lt;50%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-500" /> 50-79%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> 80-99%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" /> Full
          </span>
        </div>
      </div>
    </div>
  );
}
