'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatCentsDecimal } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { Payment } from '@/types/database';

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('parent_id', user.id)
        .order('created_at', { ascending: false });

      if (data) setPayments(data);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'succeeded': return 'badge-green';
      case 'failed': return 'badge-red';
      case 'pending': return 'badge-yellow';
      case 'refunded': return 'badge-blue';
      case 'comped': return 'badge-blue';
      default: return 'badge';
    }
  };

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payment History</h1>
            <p className="text-gray-600">View your payment and billing history</p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="card text-center py-12">
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No payments yet</h3>
            <p className="text-gray-500">Your payment history will appear here once you subscribe to a plan.</p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Date</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Description</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Amount</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">{formatDate(p.created_at)}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{p.description || 'Payment'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{formatCentsDecimal(p.amount_cents)}</td>
                    <td className="px-6 py-4"><span className={statusBadge(p.status)}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
