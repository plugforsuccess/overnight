'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, AlertCircle, Clock, Moon, MessageSquare, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { format, parseISO } from 'date-fns';
import { formatWeekRange, cn } from '@/lib/utils';
import { formatCents, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { ChildSafetyCard, ChildSafetyInfo } from '@/components/ui/ChildSafetyCard';
import { SafetyChipRow } from '@/components/ui/SafetyChipRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CaregiverNotesCard } from '@/components/ui/CaregiverNotesCard';
import { ReservationTimeline } from '@/components/ui/ReservationTimeline';

interface BlockInfo {
  id: string;
  week_start: string;
  nights_per_week: number;
  weekly_price_cents: number;
  status: string;
  payment_status: string;
  caregiver_notes: string;
  created_at: string;
}

interface NightInfo {
  id: string;
  date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TimelineEvent {
  id: string;
  reservation_id: string;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
}

interface DetailData {
  block: BlockInfo;
  child: ChildSafetyInfo | null;
  nights: NightInfo[];
  events: TimelineEvent[];
}

export default function ReservationDetailPage() {
  const searchParams = useSearchParams();
  const blockId = searchParams.get('blockId');

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!blockId) {
      setError('No booking ID provided');
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Please log in to view this booking');
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/reservations/detail?blockId=${blockId}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || 'Failed to load booking');
        }

        setData(await res.json());
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [blockId]);

  async function handleNotesChange(notes: string) {
    if (!blockId || !data) return;
    setSavingNotes(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(`/api/reservations/detail?blockId=${blockId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caregiver_notes: notes }),
      });

      setData((prev: DetailData | null) => prev ? {
        ...prev,
        block: { ...prev.block, caregiver_notes: notes },
      } : prev);
    } catch (err: any) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes(false);
    }
  }

  if (loading) {
    return (
      <div className="py-8 sm:py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse mb-6" />
          <div className="space-y-4">
            <div className="card animate-pulse h-24" />
            <div className="card animate-pulse h-48" />
            <div className="card animate-pulse h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p>{error || 'Booking not found'}</p>
              <Link href="/dashboard/reservations" className="text-sm font-medium underline mt-2 block">
                Back to reservations
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { block, child, nights, events } = data;
  const weekStart = parseISO(block.week_start);

  // Derive overall status from nights
  const activeNights = nights.filter((n: NightInfo) => !['canceled', 'cancelled'].includes(n.status));
  const allConfirmed = activeNights.every((n: NightInfo) => n.status === 'confirmed' || n.status === 'locked');
  const anyWaitlisted = activeNights.some((n: NightInfo) => n.status === 'waitlisted');
  const overallStatus = block.status === 'cancelled' || block.status === 'canceled'
    ? 'cancelled'
    : allConfirmed ? 'confirmed'
    : anyWaitlisted ? 'waitlisted'
    : 'pending';

  return (
    <div className="py-8 sm:py-12 pb-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/reservations" className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Week of {formatWeekRange(weekStart)}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {child && <span className="text-sm text-gray-500">{child.first_name} {child.last_name}</span>}
              <StatusBadge status={overallStatus} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Section A — Child safety card */}
          {child && <ChildSafetyCard child={child} compact={false} showEditLink />}

          {/* Section B — Night timeline */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Nights</div>
            <div className="space-y-2">
              {nights.map((night: NightInfo) => {
                const dateObj = parseISO(night.date);
                const isCancelled = ['canceled', 'cancelled'].includes(night.status);
                return (
                  <div
                    key={night.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl border transition-colors',
                      isCancelled ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-navy-100 flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-semibold text-navy-600 leading-none uppercase">
                          {format(dateObj, 'MMM')}
                        </span>
                        <span className="text-sm font-bold text-navy-800 leading-tight">
                          {format(dateObj, 'd')}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{format(dateObj, 'EEEE')}</div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {OVERNIGHT_START} &ndash; {OVERNIGHT_END}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={night.status} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section C — Care details + safety */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Care details</div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <span className="text-gray-500 block text-xs mb-0.5">Dropoff</span>
                <span className="font-medium text-gray-900">{OVERNIGHT_START}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs mb-0.5">Pickup</span>
                <span className="font-medium text-gray-900">{OVERNIGHT_END}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs mb-0.5">Plan</span>
                <span className="font-medium text-gray-900">{block.nights_per_week}-Night Plan</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs mb-0.5">Weekly</span>
                <span className="font-medium text-gray-900">{formatCents(block.weekly_price_cents)}</span>
              </div>
            </div>

            {child && (
              <div className="pt-3 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Safety readiness</div>
                <SafetyChipRow
                  emergencyContactsCount={child.emergency_contacts_count}
                  authorizedPickupsCount={child.authorized_pickups_count}
                  hasMedicalProfile={child.has_medical_profile}
                  hasAllergyInfo={child.allergies.length > 0}
                  hasCareNotes={!!block.caregiver_notes}
                />
              </div>
            )}
          </div>

          {/* Section D — Caregiver notes */}
          <CaregiverNotesCard
            notes={block.caregiver_notes}
            onChange={handleNotesChange}
          />

          {/* Section E — Activity timeline */}
          {events.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft-sm">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Activity</div>
              <ReservationTimeline events={events} />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              href="/dashboard/reservations"
              className="btn-secondary text-center flex-1 sm:flex-initial"
            >
              Back to reservations
            </Link>
            {child && (
              <Link
                href="/dashboard/children"
                className="btn-secondary text-center flex-1 sm:flex-initial"
              >
                View child profile
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
