'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { formatCentsDecimal } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { Payment } from '@/types/database';
import { EmptyState, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/components/ui/system';

function paymentTone(status: string): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  if (status === 'succeeded') return 'green';
  if (status === 'pending') return 'yellow';
  if (status === 'failed') return 'red';
  if (status === 'refunded' || status === 'comped') return 'blue';
  return 'gray';
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: parentRow } = await supabase.from('parents').select('id').eq('id', user.id).single();
      const parentId = parentRow?.id ?? user.id;

      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: false });

      if (data) setPayments(data);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const failedCount = payments.filter((p) => p.status === 'failed').length;
  const pendingCount = payments.filter((p) => p.status === 'pending').length;

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle="Billing status, invoices, and payment history" />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Payments" value={payments.length} tone="blue" />
        <MetricCard label="Pending" value={pendingCount} tone={pendingCount > 0 ? 'yellow' : 'green'} />
        <MetricCard label="Action Needed" value={failedCount} tone={failedCount > 0 ? 'red' : 'green'} />
      </div>

      <SectionCard title="Recent Invoices" subtitle="Latest transactions and statuses">
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Your billing history will appear here after your first booking." />
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="font-medium text-slate-900">{payment.description || 'Overnight care payment'}</p>
                  <p className="text-xs text-slate-500">{formatDate(payment.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold text-slate-900">{formatCentsDecimal(payment.amount_cents)}</p>
                  <StatusBadge tone={paymentTone(payment.status)}>{payment.status.replace('_', ' ')}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
