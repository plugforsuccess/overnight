'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Moon, CalendarCheck, CheckCircle, AlertTriangle, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReservationItem {
  id: string;
  child_id: string;
  child_first_name: string;
  child_last_name: string;
  date: string;
  status: string;
  overnight_block_id: string;
  weekly_price_cents: number | null;
  block_status: string | null;
  created_at: string;
  updated_at: string;
}

interface ReservationData {
  upcoming: ReservationItem[];
  past: ReservationItem[];
  counts: {
    upcoming: number;
    completed: number;
    action_needed: number;
  };
}

type Tab = 'upcoming' | 'past';

// ─── Reservation Card ────────────────────────────────────────────────────────

function ReservationCard({
  reservation,
  onCancel,
  cancelling,
}: {
  reservation: ReservationItem;
  onCancel: (id: string) => void;
  cancelling: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const dateObj = new Date(reservation.date + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const shortDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const canCancel = ['confirmed', 'pending_payment'].includes(reservation.status);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-soft-sm overflow-hidden">
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 sm:p-5 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            {/* Date block */}
            <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-navy-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-semibold text-navy-600 leading-none uppercase">
                {dateObj.toLocaleDateString('en-US', { month: 'short' })}
              </span>
              <span className="text-lg font-bold text-navy-800 leading-tight">
                {dateObj.getDate()}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                  {reservation.child_first_name} {reservation.child_last_name}
                </h3>
                <StatusBadge status={reservation.status} />
              </div>
              <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">
                {dateLabel}
              </p>
              <p className="text-sm text-gray-500 mt-0.5 sm:hidden">
                {shortDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:block">
              {OVERNIGHT_START} - {OVERNIGHT_END}
            </span>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 sm:px-5 py-4">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase tracking-wide mb-0.5">Date</span>
              <span className="text-gray-900">{dateLabel}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase tracking-wide mb-0.5">Dropoff / Pickup</span>
              <span className="text-gray-900">{OVERNIGHT_START} &ndash; {OVERNIGHT_END}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase tracking-wide mb-0.5">Child</span>
              <span className="text-gray-900">{reservation.child_first_name} {reservation.child_last_name}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase tracking-wide mb-0.5">Status</span>
              <StatusBadge status={reservation.status} />
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium uppercase tracking-wide mb-0.5">Booked on</span>
              <span className="text-gray-900">
                {new Date(reservation.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            {reservation.weekly_price_cents != null && (
              <div>
                <span className="text-gray-500 block text-xs font-medium uppercase tracking-wide mb-0.5">Weekly plan</span>
                <span className="text-gray-900">${(reservation.weekly_price_cents / 100).toFixed(0)}/week</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-200">
            {reservation.overnight_block_id && (
              <Link
                href={`/dashboard/reservations/detail?blockId=${reservation.overnight_block_id}`}
                className="text-sm text-accent-600 hover:text-accent-700 font-medium"
              >
                View booking details
              </Link>
            )}
            {canCancel && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure you want to cancel this reservation? This action cannot be undone.')) {
                    onCancel(reservation.id);
                  }
                }}
                disabled={cancelling === reservation.id}
                className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50 ml-auto"
              >
                {cancelling === reservation.id ? 'Cancelling...' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const [data, setData] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return { 'Authorization': `Bearer ${session.access_token}` };
  }

  useEffect(() => {
    async function load() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/reservations', { headers });

        if (!res.ok) {
          throw new Error('Failed to load reservations');
        }

        const json: ReservationData = await res.json();
        setData(json);
      } catch (err: any) {
        console.error('[reservations] load error:', err);
        setError(err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCancel(reservationId: string) {
    setCancelling(reservationId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/reservations?id=${reservationId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to cancel');
      }

      setData(prev => {
        if (!prev) return prev;
        const updateStatus = (list: ReservationItem[]) =>
          list.map(r => r.id === reservationId ? { ...r, status: 'canceled' } : r);

        const updatedUpcoming = updateStatus(prev.upcoming);
        const cancelledItem = updatedUpcoming.find(r => r.id === reservationId);

        return {
          upcoming: updatedUpcoming.filter(r => r.id !== reservationId),
          past: cancelledItem ? [cancelledItem, ...prev.past] : prev.past,
          counts: {
            ...prev.counts,
            upcoming: prev.counts.upcoming - 1,
          },
        };
      });

      showToast('Reservation cancelled');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return (
      <div className="py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-48 animate-pulse mb-2" />
            <div className="h-5 bg-gray-100 rounded w-80 animate-pulse" />
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="card animate-pulse h-20" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card animate-pulse h-24" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Unable to load reservations</p>
              <p className="text-sm mt-1">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm font-medium underline mt-2"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const activeList = activeTab === 'upcoming' ? data.upcoming : data.past;

  return (
    <div className="py-8 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
            {toast}
          </div>
        )}

        {/* Inline error */}
        {error && data && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reservations</h1>
            <p className="text-gray-500 text-sm mt-1">
              View your child care bookings and stay history.
            </p>
          </div>
          <Link href="/schedule" className="btn-primary hidden sm:flex items-center gap-2 text-sm">
            <Moon className="h-4 w-4" />
            Book Overnight Care
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          <div className="card flex items-center gap-3 p-4">
            <CalendarCheck className="h-8 w-8 text-navy-700 flex-shrink-0 hidden sm:block" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{data.counts.upcoming}</div>
              <div className="text-xs sm:text-sm text-gray-500">Upcoming</div>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0 hidden sm:block" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{data.counts.completed}</div>
              <div className="text-xs sm:text-sm text-gray-500">Completed</div>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <AlertTriangle className="h-8 w-8 text-yellow-600 flex-shrink-0 hidden sm:block" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{data.counts.action_needed}</div>
              <div className="text-xs sm:text-sm text-gray-500">Needs Action</div>
            </div>
          </div>
        </div>

        {/* Tab control */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'upcoming'
                ? 'border-accent-500 text-accent-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Upcoming ({data.upcoming.length})
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'past'
                ? 'border-accent-500 text-accent-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Past ({data.past.length})
          </button>
        </div>

        {/* Reservation list */}
        {activeList.length === 0 ? (
          activeTab === 'upcoming' ? (
            <EmptyStateCard
              icon={<Moon className="h-8 w-8" />}
              title="No upcoming overnights yet"
              description="Book your child's first overnight stay."
              actionLabel="Book Overnight Care"
              actionHref="/schedule"
            />
          ) : (
            <EmptyStateCard
              icon={<CheckCircle className="h-8 w-8" />}
              title="No past reservations"
              description="Your completed stays will appear here after your first overnight booking."
            />
          )
        ) : (
          <div className="space-y-3">
            {activeList.map(reservation => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                onCancel={handleCancel}
                cancelling={cancelling}
              />
            ))}
          </div>
        )}

        {/* Mobile CTA */}
        <div className="sm:hidden mt-6">
          <Link href="/schedule" className="btn-primary w-full flex items-center justify-center gap-2">
            <Moon className="h-4 w-4" />
            Book Overnight Care
          </Link>
        </div>
      </div>
    </div>
  );
}
