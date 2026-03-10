'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { formatCents } from '@/lib/constants';
import { AlertCard, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState({ activePlansCount: 0, totalChildren: 0, weeklyRevenue: 0, waitlistedCount: 0, openIncidents: 0, activeStaff: 0 });
  const [loading, setLoading] = useState(true);

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const summaryRes = await fetch('/api/admin', { headers: await getAuthHeaders() });
      const summary = await summaryRes.json();
      if (!summaryRes.ok) throw new Error(summary.error || 'Failed to load admin summary');

      setStats({
        activePlansCount: summary.activePlansCount ?? 0,
        totalChildren: summary.totalChildren ?? 0,
        weeklyRevenue: summary.weeklyRevenue ?? 0,
        waitlistedCount: summary.waitlistedCount ?? 0,
        openIncidents: summary.openIncidents ?? 0,
        activeStaff: summary.activeStaff ?? 0,
      });
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Facility Overview" subtitle="Tonight's occupancy, safety risk, waitlist pressure, and revenue at a glance" />
      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Active Plans" value={stats.activePlansCount} tone="blue" />
        <MetricCard label="Children" value={stats.totalChildren} tone="gray" />
        <MetricCard label="Weekly Revenue" value={formatCents(stats.weeklyRevenue)} tone="green" />
        <MetricCard label="Waitlist" value={stats.waitlistedCount} tone={stats.waitlistedCount > 0 ? 'yellow' : 'green'} />
        <MetricCard label="Open Incidents" value={stats.openIncidents} tone={stats.openIncidents > 0 ? 'red' : 'green'} />
      </div>

      {(stats.waitlistedCount > 0 || stats.openIncidents > 0) && (
        <AlertCard tone={stats.openIncidents > 0 ? 'red' : 'yellow'} title="Operational attention needed">
          {stats.openIncidents > 0 ? `${stats.openIncidents} incidents need review.` : `${stats.waitlistedCount} waitlist entries need promotion decisions.`}
        </AlertCard>
      )}

      <SectionCard title="Control Center" subtitle="Jump to operational queues and management views">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['/admin/roster', 'Roster'], ['/admin/incidents', 'Incidents'], ['/admin/pickup-verification', 'Pickup Verification'], ['/admin/waitlist', 'Waitlist'], ['/admin/compliance', 'Compliance'], ['/admin/safety', 'Safety'], ['/admin/health', 'Health'], ['/admin/revenue', 'Revenue'], ['/admin/capacity', 'Capacity'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-white">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{label}</p>
                <StatusBadge tone="blue">open</StatusBadge>
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
