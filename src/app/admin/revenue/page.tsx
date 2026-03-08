'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
  DollarSign,
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';

interface RevenueData {
  period: { start: string; end: string };
  weekly_expected: number;
  collected: number;
  outstanding: number;
  failed_payments: number;
  refunded: number;
  upcoming_reservation_count: number;
  ledger_entries: any[];
  payments?: any[];
  source: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function RevenueDashboard() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch('/api/admin/revenue', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const entries = data?.ledger_entries || data?.payments || [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Revenue & Billing</h1>
              {data && (
                <p className="text-sm text-gray-500">
                  {data.period.start} — {data.period.end}
                  {data.source === 'payments' && (
                    <span className="ml-2 text-xs text-amber-600">(from payments table)</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="card p-8 text-center text-gray-500">Loading revenue data...</div>
        ) : !data ? (
          <div className="card p-8 text-center text-gray-500">Failed to load revenue data.</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-700">{formatCents(data.weekly_expected)}</p>
                    <p className="text-sm text-gray-500">Expected Revenue</p>
                  </div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">{formatCents(data.collected)}</p>
                    <p className="text-sm text-gray-500">Collected</p>
                  </div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-700">{formatCents(data.outstanding)}</p>
                    <p className="text-sm text-gray-500">Outstanding</p>
                  </div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-700">{data.failed_payments}</p>
                    <p className="text-sm text-gray-500">Failed Payments</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming Reservations */}
            <div className="card p-4 mb-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  <strong>{data.upcoming_reservation_count}</strong> upcoming confirmed reservations
                </span>
              </div>
            </div>

            {/* Revenue Table */}
            {entries.length === 0 ? (
              <div className="card p-8 text-center text-gray-500">
                No billing entries for this period. Revenue data will appear here as bookings are processed.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Parent</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Child</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((entry: any) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {entry.parent
                            ? `${entry.parent.first_name} ${entry.parent.last_name}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {entry.child
                            ? `${entry.child.first_name} ${entry.child.last_name}`
                            : entry.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {entry.care_date || entry.created_at?.split('T')[0] || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          {formatCents(entry.amount_cents)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            entry.status === 'paid' || entry.status === 'succeeded'
                              ? 'bg-green-50 text-green-700'
                              : entry.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : entry.status === 'failed'
                              ? 'bg-red-50 text-red-700'
                              : entry.status === 'refunded'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-gray-50 text-gray-700'
                          }`}>
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
