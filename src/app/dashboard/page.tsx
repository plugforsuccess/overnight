'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Users, CreditCard, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatCents } from '@/lib/constants';
import type { DashboardData } from '@/types/dashboard';

import { ChildSnapshotCard } from '@/components/dashboard/ChildSnapshotCard';
import { NextReservationCard } from '@/components/dashboard/NextReservationCard';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { TodoAlertsFeed } from '@/components/dashboard/TodoAlertsFeed';
import { BillingSummaryCard } from '@/components/dashboard/BillingSummaryCard';

/**
 * Dashboard page — client component for interactivity.
 *
 * Auth is already validated server-side by dashboard/layout.tsx.
 * This component does NOT redirect to /login — the server layout
 * handles that before this component ever mounts.
 */
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Session is guaranteed by server layout — get the token for API call
        const { data: { session } } = await supabase.auth.getSession();

        console.log(`[dashboard/page] client session: exists=${!!session} userId=${session?.user?.id ?? 'null'}`);

        if (!session) {
          // Session cookie exists (middleware passed us through) but the
          // browser client hasn't hydrated yet. Wait briefly and retry once.
          console.log('[dashboard/page] Session not yet hydrated — retrying in 500ms');
          await new Promise(r => setTimeout(r, 500));
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (!retrySession) {
            setError('Session expired. Please refresh the page or log in again.');
            setLoading(false);
            return;
          }
          return loadDashboard(retrySession.access_token);
        }

        return loadDashboard(session.access_token);
      } catch (err: any) {
        console.error('[dashboard/page] load error:', err);
        setError(err.message);
        setLoading(false);
      }
    }

    async function loadDashboard(accessToken: string) {
      const res = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      console.log(`[dashboard/page] /api/dashboard response: status=${res.status}`);

      if (!res.ok) {
        const body = await res.text();
        console.error(`[dashboard/page] /api/dashboard error body: ${body}`);
        throw new Error('Failed to load dashboard');
      }

      const dashboardData: DashboardData = await res.json();
      setData(dashboardData);

      // Default to first child
      if (dashboardData.children.length > 0) {
        setSelectedChildId(dashboardData.children[0].id);
      }
      setLoading(false);
    }

    load();
  }, []);

  // Loading state with skeleton cards
  if (loading) {
    return (
      <div className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header skeleton */}
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-64 animate-pulse mb-2" />
            <div className="h-5 bg-gray-100 rounded w-48 animate-pulse" />
          </div>

          {/* Stats skeleton */}
          <div className="grid sm:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-gray-200 rounded" />
                  <div>
                    <div className="h-6 w-12 bg-gray-200 rounded mb-1" />
                    <div className="h-4 w-24 bg-gray-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Row A skeleton */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <div className="card animate-pulse h-48" />
            <div className="card animate-pulse h-48" />
          </div>

          {/* Quick actions skeleton */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { profile, children, nextReservation, subscriptions, weeklyTotalCents, upcomingReservationsCount, waitlistCount } = data;
  const selectedChild = children.find(c => c.id === selectedChildId) || children[0] || null;
  const hasChildren = children.length > 0;

  // Check if reservation should be blocked (missing safety info)
  const canReserve = selectedChild
    ? selectedChild.emergency_contacts_count >= 1 && selectedChild.authorized_pickups_count >= 1
    : false;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with personalization */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {profile.first_name}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {hasChildren
                ? `Managing ${children.length} child${children.length > 1 ? 'ren' : ''}`
                : 'Get started by adding your child\'s profile'}
            </p>
          </div>

          {/* Child switcher (multi-child) */}
          {children.length > 1 && (
            <div className="relative">
              <label className="text-xs text-gray-500 block mb-1">Viewing</label>
              <select
                value={selectedChildId || ''}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="input-field pr-8 text-sm font-medium min-w-[180px]"
              >
                {children.map(child => (
                  <option key={child.id} value={child.id}>
                    {child.first_name} {child.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid sm:grid-cols-4 gap-4 mb-8">
          <div className="card flex items-center gap-3">
            <Calendar className="h-8 w-8 text-navy-700" />
            <div>
              <div className="text-2xl font-bold">{upcomingReservationsCount}</div>
              <div className="text-sm text-gray-500">Upcoming Nights</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Users className="h-8 w-8 text-accent-600" />
            <div>
              <div className="text-2xl font-bold">{children.length}</div>
              <div className="text-sm text-gray-500">Children</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold">{formatCents(weeklyTotalCents)}</div>
              <div className="text-sm text-gray-500">Weekly Total</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold">{waitlistCount}</div>
              <div className="text-sm text-gray-500">On Waitlist</div>
            </div>
          </div>
        </div>

        {/* Empty state for new parents */}
        {!hasChildren && (
          <div className="card text-center py-12 mb-8">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Complete Your Setup</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              To start reserving overnight care, add your child&apos;s profile, emergency contacts, and authorized pickups.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Link href="/dashboard/children" className="btn-primary">
                Add Child
              </Link>
            </div>
            <div className="mt-8 text-left max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Setup checklist</h3>
              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold">1</span>
                  Add child profile
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold">2</span>
                  Add emergency contact
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold">3</span>
                  Add authorized pickup
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold">4</span>
                  Reserve nights
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Row A — Child Snapshot + Next Reservation */}
        {hasChildren && selectedChild && (
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <ChildSnapshotCard child={selectedChild} />
            <NextReservationCard reservation={nextReservation} />
          </div>
        )}

        {/* Row B — Quick Actions */}
        {hasChildren && (
          <div className="mb-8">
            <QuickActions hasChildren={hasChildren} />
            {!canReserve && selectedChild && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Reservations require at least 1 emergency contact and 1 authorized pickup for {selectedChild.first_name}.{' '}
                  <Link href="/dashboard/children" className="font-medium underline">Complete profile</Link>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Row C — To-do / Alerts Feed */}
        {hasChildren && (
          <div className="mb-8">
            <TodoAlertsFeed childrenList={children} />
          </div>
        )}

        {/* Row D — Billing + Plan */}
        {hasChildren && (
          <div className="mb-8">
            <BillingSummaryCard
              subscriptions={subscriptions}
              weeklyTotalCents={weeklyTotalCents}
              stripeCustomerId={profile.stripe_customer_id}
            />
          </div>
        )}

        {/* Row E — Navigation Links */}
        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <Link href="/dashboard/children" className="card hover:shadow-md transition-shadow text-center">
            <Users className="h-8 w-8 text-navy-700 mx-auto mb-2" />
            <div className="font-semibold">Manage Children</div>
            <div className="text-sm text-gray-500">Add/edit child profiles</div>
          </Link>
          <Link href="/dashboard/payments" className="card hover:shadow-md transition-shadow text-center">
            <CreditCard className="h-8 w-8 text-navy-700 mx-auto mb-2" />
            <div className="font-semibold">Payment History</div>
            <div className="text-sm text-gray-500">View invoices & payments</div>
          </Link>
          <Link href="/schedule" className="card hover:shadow-md transition-shadow text-center">
            <Calendar className="h-8 w-8 text-navy-700 mx-auto mb-2" />
            <div className="font-semibold">Reserve Nights</div>
            <div className="text-sm text-gray-500">Book for next week</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
