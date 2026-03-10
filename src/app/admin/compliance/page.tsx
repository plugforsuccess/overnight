'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { AlertCard, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

interface CompliancePayload {
  compliantChildren: number;
  expiringDocuments: number;
  incidentRate: number;
  attendanceAnomalies: number;
}

export default function AdminCompliancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CompliancePayload>({ compliantChildren: 0, expiringDocuments: 0, incidentRate: 0, attendanceAnomalies: 0 });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/compliance', { headers: { Authorization: `Bearer ${sessionData.session?.access_token || ''}` } });
      if (res.ok) setData(await res.json());
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance Overview" subtitle="Document health, incident trend, and attendance anomalies" />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Compliant Children" value={data.compliantChildren} tone="green" />
        <MetricCard label="Expiring Docs" value={data.expiringDocuments} tone={data.expiringDocuments > 0 ? 'yellow' : 'green'} />
        <MetricCard label="Incident Rate" value={`${data.incidentRate}%`} tone={data.incidentRate > 5 ? 'red' : 'blue'} />
        <MetricCard label="Attendance Anomalies" value={data.attendanceAnomalies} tone={data.attendanceAnomalies > 0 ? 'yellow' : 'green'} />
      </div>

      <SectionCard title="Risk and Attention Surface" subtitle="Prioritize upcoming compliance work">
        <div className="space-y-3">
          {data.expiringDocuments > 0 && <AlertCard tone="yellow" title="Documents expiring soon">{data.expiringDocuments} child profiles have documentation nearing expiration.</AlertCard>}
          {data.attendanceAnomalies > 0 && <AlertCard tone="blue" title="Attendance anomalies">Review flagged attendance transitions for correction and audit readiness.</AlertCard>}
          <div className="flex items-center gap-2"><StatusBadge tone={data.incidentRate > 5 ? 'red' : 'green'}>{data.incidentRate > 5 ? 'elevated incident rate' : 'incident rate stable'}</StatusBadge></div>
        </div>
      </SectionCard>
    </div>
  );
}
