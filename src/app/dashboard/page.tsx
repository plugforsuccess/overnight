'use client';

import { useState, useEffect } from 'react';
import type { ComplianceStatus } from '@/types/compliance';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { formatCents } from '@/lib/constants';
import type { DashboardData } from '@/types/dashboard';
import { AlertCard, DocumentStatusCard, MetricCard, PageHeader, ReservationStatusCard, SectionCard, StatusBadge, Timeline, TimelineItem } from '@/components/ui/system';

function statusTone(status?: string): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  if (!status) return 'gray';
  if (['checked in', 'checked_out', 'checked out', 'confirmed', 'complete'].includes(status.toLowerCase())) return 'green';
  if (['pending', 'pending_payment', 'expected'].includes(status.toLowerCase())) return 'yellow';
  if (['incident', 'denied', 'cancelled'].includes(status.toLowerCase())) return 'red';
  return 'blue';
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [complianceByChild, setComplianceByChild] = useState<Record<string, ComplianceStatus>>({});

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          await new Promise((r) => setTimeout(r, 500));
          const { data: { session: retrySession } } = await supabase.auth.getSession();
          if (!retrySession) { setError('Session expired. Please refresh the page or log in again.'); setLoading(false); return; }
          return loadDashboard(retrySession.access_token);
        }
        return loadDashboard(session.access_token);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    }

    async function loadDashboard(accessToken: string) {
      const res = await fetch('/api/dashboard', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error('Failed to load dashboard');

      const dashboardData: DashboardData = await res.json();
      setData(dashboardData);
      if (dashboardData.children.length > 0) {
        setSelectedChildId(dashboardData.children[0].id);
        const complianceEntries = await Promise.all(dashboardData.children.map(async (child) => {
          const cres = await fetch(`/api/children/${child.id}/compliance`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const cdata = await cres.json();
          return [child.id, cdata.status] as const;
        }));
        setComplianceByChild(Object.fromEntries(complianceEntries));
      }
      setLoading(false);
    }

    load();
  }, []);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;
  if (error) return <AlertCard tone="red" title="Unable to load dashboard">{error}</AlertCard>;
  if (!data) return null;

  const { children, nextReservation, upcomingNights, notifications = [], weeklyTotalCents, upcomingReservationsCount, waitlistCount, profile, profileCompleteness } = data;
  const selectedChild = children.find((c) => c.id === selectedChildId) || children[0] || null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Good evening, ${profile.first_name}`} subtitle="Parent Trust Dashboard" actions={<Link href="/schedule" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Book overnight</Link>} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Upcoming Nights" value={upcomingReservationsCount} tone="blue" />
        <MetricCard label="Weekly Billing" value={formatCents(weeklyTotalCents)} tone="green" />
        <MetricCard label="Waitlist" value={waitlistCount} tone={waitlistCount > 0 ? 'yellow' : 'green'} />
        <MetricCard label="Profile Complete" value={`${profileCompleteness}%`} tone={profileCompleteness < 80 ? 'yellow' : 'green'} />
      </div>

      <SectionCard title="Tonight's Status" subtitle="Current care and readiness snapshot">
        {nextReservation ? (
          <ReservationStatusCard title={`${nextReservation.child_first_name} ${nextReservation.child_last_name}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">Next stay: {new Date(`${nextReservation.date}T00:00:00`).toLocaleDateString()}</p>
              <StatusBadge tone={statusTone(nextReservation.status)}>{nextReservation.status}</StatusBadge>
            </div>
          </ReservationStatusCard>
        ) : <p className="text-sm text-slate-500">No reservation scheduled tonight.</p>}
      </SectionCard>

      <SectionCard title="Child Activity Timeline" subtitle="What happened and when">
        <Timeline>
          {upcomingNights.slice(0, 6).map((night) => (
            <TimelineItem key={night.id} title={`${night.child_first_name} ${night.child_last_name} · ${night.status}`} description="Reservation lifecycle update" time={new Date(`${night.date}T00:00:00`).toLocaleDateString()} tone={statusTone(night.status)} />
          ))}
          {notifications.slice(0, 4).map((notification) => (
            <TimelineItem key={notification.id} title={notification.title} description={notification.message} tone={notification.type === 'warning' ? 'yellow' : 'blue'} />
          ))}
        </Timeline>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Incident Alerts" subtitle="Parent-safe safety notifications">
          {notifications.filter((n) => n.type === 'warning').length === 0 ? <StatusBadge tone="green">No active incident alerts</StatusBadge> : notifications.filter((n) => n.type === 'warning').map((n) => <AlertCard key={n.id} tone="yellow" title={n.title}>{n.message}</AlertCard>)}
        </SectionCard>

        <DocumentStatusCard title="Document Compliance">
          {selectedChild ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">{selectedChild.first_name} {selectedChild.last_name}</p>
              <StatusBadge tone={complianceByChild[selectedChild.id]?.eligibleToBook ? 'green' : 'yellow'}>{complianceByChild[selectedChild.id]?.eligibleToBook ? 'ready for booking' : 'needs review'}</StatusBadge>
              <p className="text-xs text-slate-500">Authorized pickups: {selectedChild.authorized_pickups_count} · Emergency contacts: {selectedChild.emergency_contacts_count}</p>
            </div>
          ) : <p className="text-sm text-slate-500">Add a child profile to view document status.</p>}
        </DocumentStatusCard>
      </div>
    </div>
  );
}
