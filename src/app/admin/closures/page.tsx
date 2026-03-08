'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, XCircle, Minus, RotateCcw, AlertTriangle,
  Calendar, Users, Clock, ChevronLeft, ChevronRight, Ban,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';
import { format, addDays, startOfDay } from 'date-fns';

const REASON_LABELS: Record<string, string> = {
  holiday: 'Holiday',
  staff_shortage: 'Staff Shortage',
  weather: 'Weather',
  facility_issue: 'Facility Issue',
  emergency_closure: 'Emergency Closure',
  low_demand: 'Low Demand',
  maintenance: 'Maintenance',
  other: 'Other',
};

type OverrideAction = 'close' | 'reduce_capacity' | 'reopen';

interface DateImpact {
  careDate: string;
  currentCapacityTotal: number;
  currentReserved: number;
  currentWaitlisted: number;
  currentStatus: string;
  affectedBookingsCount: number;
  overCapacityDelta: number;
  communicationNeeded: boolean;
  hasActiveOverride: boolean;
  activeOverrideType: string | null;
}

interface OverrideItem {
  id: string;
  careDate: string;
  overrideType: string;
  capacityOverride: number | null;
  reasonCode: string;
  reasonText: string | null;
  effectiveCapacity: number;
  reserved: number;
  waitlisted: number;
  overCapacity: boolean;
  overCapacityBy: number;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  care_date: string;
  event_at: string;
  metadata: any;
}

export default function ClosuresPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<OverrideItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()));

  // Action panel state
  const [showAction, setShowAction] = useState(false);
  const [actionType, setActionType] = useState<OverrideAction>('close');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reasonCode, setReasonCode] = useState('other');
  const [reasonText, setReasonText] = useState('');
  const [newCapacity, setNewCapacity] = useState(3);
  const [preview, setPreview] = useState<DateImpact[] | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const rangeStart = format(weekStart, 'yyyy-MM-dd');
  const rangeEnd = format(addDays(weekStart, 29), 'yyyy-MM-dd');

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const loadData = useCallback(async () => {
    const headers = await getAuthHeaders();

    const [overridesRes, activityRes] = await Promise.all([
      fetch(`/api/admin/closures?start=${rangeStart}&end=${rangeEnd}`, { headers }),
      fetch(`/api/admin/closures?start=${rangeStart}&end=${rangeEnd}`, { headers }),
    ]);

    if (overridesRes.ok) {
      const { overrides: o } = await overridesRes.json();
      setOverrides(o || []);
    }

    // Load recent activity events
    // We'll load from the override events via the list endpoint metadata
    setActivity([]);
    setLoading(false);
  }, [getAuthHeaders, rangeStart, rangeEnd]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }
      loadData();
    }
    init();
  }, [router, loadData]);

  async function handlePreview() {
    if (!startDate || !endDate) return;
    setActionLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/closures', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'preview',
          overrideAction: actionType,
          startDate,
          endDate,
          capacityOverride: actionType === 'reduce_capacity' ? newCapacity : null,
        }),
      });
      if (res.ok) {
        const { impact } = await res.json();
        setPreview(impact);
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApply() {
    if (!startDate || !endDate) return;
    setActionLoading(true);
    try {
      const headers = await getAuthHeaders();
      const endpoint = actionType === 'reopen' ? 'reopen' : 'apply';
      const res = await fetch('/api/admin/closures', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: endpoint,
          overrideAction: actionType,
          startDate,
          endDate,
          capacityOverride: actionType === 'reduce_capacity' ? newCapacity : null,
          reasonCode,
          reasonText: reasonText || undefined,
        }),
      });
      if (res.ok) {
        setShowAction(false);
        setPreview(null);
        setStartDate('');
        setEndDate('');
        setReasonText('');
        loadData();
      } else {
        const { error } = await res.json();
        alert(`Failed: ${error}`);
      }
    } finally {
      setActionLoading(false);
    }
  }

  // Summary counts
  const closedCount = overrides.filter(o => o.overrideType === 'closed').length;
  const reducedCount = overrides.filter(o => o.overrideType === 'reduced_capacity').length;
  const overCapacityCount = overrides.filter(o => o.overCapacity).length;
  const reviewNeeded = overrides.filter(o => o.overCapacity || (o.overrideType === 'closed' && o.reserved > 0)).length;

  // Build calendar grid (30 days)
  const calDays: { date: string; label: string; dayName: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = addDays(weekStart, i);
    calDays.push({
      date: format(d, 'yyyy-MM-dd'),
      label: format(d, 'MMM d'),
      dayName: format(d, 'EEE'),
    });
  }

  const overrideMap = new Map<string, OverrideItem>();
  overrides.forEach(o => overrideMap.set(o.careDate, o));

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Closures &amp; Capacity</h1>
            <p className="text-gray-500">Manage night closures, capacity reductions, and reopenings</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <Ban className="h-6 w-6 text-red-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-red-600">{closedCount}</div>
            <div className="text-xs text-gray-500">Closed nights</div>
          </div>
          <div className="card text-center">
            <Minus className="h-6 w-6 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-amber-600">{reducedCount}</div>
            <div className="text-xs text-gray-500">Reduced capacity</div>
          </div>
          <div className="card text-center">
            <AlertTriangle className="h-6 w-6 text-red-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-red-700">{overCapacityCount}</div>
            <div className="text-xs text-gray-500">Over capacity</div>
          </div>
          <div className="card text-center">
            <Clock className="h-6 w-6 text-navy-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-navy-700">{reviewNeeded}</div>
            <div className="text-xs text-gray-500">Need review</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mb-6">
          <button onClick={() => { setShowAction(true); setActionType('close'); setPreview(null); }}
            className="btn-primary flex items-center gap-2 text-sm bg-red-600 hover:bg-red-700">
            <XCircle className="h-4 w-4" /> Close Night
          </button>
          <button onClick={() => { setShowAction(true); setActionType('reduce_capacity'); setPreview(null); }}
            className="btn-primary flex items-center gap-2 text-sm bg-amber-600 hover:bg-amber-700">
            <Minus className="h-4 w-4" /> Reduce Capacity
          </button>
          <button onClick={() => { setShowAction(true); setActionType('reopen'); setPreview(null); }}
            className="btn-primary flex items-center gap-2 text-sm bg-green-600 hover:bg-green-700">
            <RotateCcw className="h-4 w-4" /> Reopen Night
          </button>
        </div>

        {/* Action Panel */}
        {showAction && (
          <div className="card mb-6 border-2 border-navy-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {actionType === 'close' ? 'Close Night(s)' : actionType === 'reduce_capacity' ? 'Reduce Capacity' : 'Reopen Night(s)'}
              </h3>
              <button onClick={() => { setShowAction(false); setPreview(null); }} className="text-gray-400 hover:text-gray-600">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            {actionType === 'reduce_capacity' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Capacity</label>
                <input type="number" min={0} value={newCapacity} onChange={e => setNewCapacity(parseInt(e.target.value) || 0)}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}

            {actionType !== 'reopen' && (
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(REASON_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <input type="text" value={reasonText} onChange={e => setReasonText(e.target.value)}
                    placeholder="Additional context..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {actionType !== 'reopen' && (
                <button onClick={handlePreview} disabled={actionLoading || !startDate || !endDate}
                  className="btn-secondary text-sm disabled:opacity-50">
                  Preview Impact
                </button>
              )}
              <button onClick={handleApply} disabled={actionLoading || !startDate || !endDate}
                className={cn('btn-primary text-sm disabled:opacity-50',
                  actionType === 'close' ? 'bg-red-600 hover:bg-red-700' :
                  actionType === 'reopen' ? 'bg-green-600 hover:bg-green-700' : '')}>
                {actionLoading ? 'Processing...' : 'Apply'}
              </button>
            </div>

            {/* Preview results */}
            {preview && preview.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Impact Preview</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {preview.map(d => (
                    <div key={d.careDate} className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                      d.overCapacityDelta > 0 ? 'bg-red-50 border border-red-200' :
                      d.communicationNeeded ? 'bg-amber-50 border border-amber-200' :
                      'bg-gray-50 border border-gray-200'
                    )}>
                      <div>
                        <span className="font-medium">{d.careDate}</span>
                        <span className="text-gray-500 ml-2">Cap: {d.currentCapacityTotal}</span>
                        <span className="text-gray-500 ml-2">Booked: {d.currentReserved}</span>
                        <span className="text-gray-500 ml-2">Waitlisted: {d.currentWaitlisted}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.overCapacityDelta > 0 && (
                          <span className="text-red-600 font-medium">Over by {d.overCapacityDelta}</span>
                        )}
                        {d.communicationNeeded && (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                            <AlertTriangle className="h-3 w-3" /> Families affected
                          </span>
                        )}
                        {d.hasActiveOverride && (
                          <span className="text-xs text-gray-500">Has override: {d.activeOverrideType}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Calendar Grid — 30-day operational view */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">30-Day Operational Calendar</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => setWeekStart(startOfDay(new Date()))}
                className="text-sm text-navy-600 hover:underline px-2">Today</button>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="p-1 rounded hover:bg-gray-100"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calDays.slice(0, 28).map(day => {
              const override = overrideMap.get(day.date);
              const isClosed = override?.overrideType === 'closed';
              const isReduced = override?.overrideType === 'reduced_capacity';
              const isOverCapacity = override?.overCapacity;

              return (
                <div key={day.date} className={cn(
                  'rounded-lg p-2 text-center text-sm border',
                  isClosed ? 'bg-red-50 border-red-300' :
                  isOverCapacity ? 'bg-red-50 border-red-200' :
                  isReduced ? 'bg-amber-50 border-amber-300' :
                  'bg-white border-gray-200'
                )}>
                  <div className="text-xs text-gray-500">{day.dayName}</div>
                  <div className="font-medium text-gray-900">{day.label}</div>
                  {isClosed && (
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
                        <Ban className="h-3 w-3" /> Closed
                      </span>
                      {override.reserved > 0 && (
                        <div className="text-xs text-red-500 mt-0.5">{override.reserved} booked</div>
                      )}
                    </div>
                  )}
                  {isReduced && (
                    <div className="mt-1">
                      <span className="text-xs font-medium text-amber-600">
                        Cap: {override.effectiveCapacity}
                      </span>
                      {isOverCapacity && (
                        <div className="text-xs text-red-500 mt-0.5">+{override.overCapacityBy} over</div>
                      )}
                    </div>
                  )}
                  {!override && (
                    <div className="mt-1 text-xs text-gray-400">Open</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Overrides List */}
        {overrides.length > 0 && (
          <div className="card mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Overrides</h2>
            <div className="space-y-2">
              {overrides.map(o => (
                <div key={o.id} className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-lg border',
                  o.overrideType === 'closed' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                )}>
                  <div>
                    <span className="font-medium text-gray-900">{o.careDate}</span>
                    <span className={cn('ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      o.overrideType === 'closed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {o.overrideType === 'closed' ? 'Closed' : `Reduced to ${o.capacityOverride}`}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">{REASON_LABELS[o.reasonCode] || o.reasonCode}</span>
                    {o.reasonText && <span className="ml-2 text-sm text-gray-400">— {o.reasonText}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500"><Users className="h-3 w-3 inline mr-1" />{o.reserved} booked</span>
                    {o.waitlisted > 0 && <span className="text-gray-500"><Clock className="h-3 w-3 inline mr-1" />{o.waitlisted} waitlisted</span>}
                    {o.overCapacity && (
                      <span className="text-red-600 font-medium">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />Over by {o.overCapacityBy}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {overrides.length === 0 && !showAction && (
          <div className="card text-center py-12">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No closures or capacity reductions in the next 30 days.</p>
            <p className="text-sm text-gray-400">Use the action buttons above to close or reduce capacity for specific nights.</p>
          </div>
        )}
      </div>
    </div>
  );
}
