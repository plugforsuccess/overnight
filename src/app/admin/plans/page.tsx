'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, DollarSign, Pause, XCircle, Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatCents } from '@/lib/constants';
import { Plan } from '@/types/database';

export default function AdminPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('auth_user_id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data } = await supabase
        .from('plans')
        .select('*, child:children(*), parent:parents(*)')
        .order('created_at', { ascending: false });

      if (data) setPlans(data);
      setLoading(false);
    }
    load();
  }, [router]);

  async function updatePlanStatus(planId: string, status: 'active' | 'paused' | 'cancelled') {
    await supabase.from('plans').update({ status, updated_at: new Date().toISOString() }).eq('id', planId);
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, status } : p));
  }

  async function compWeek(plan: Plan) {
    await supabase.from('payments').insert({
      parent_id: plan.parent_id,
      plan_id: plan.id,
      amount_cents: 0,
      status: 'comped',
      description: 'Complimentary week (admin)',
      week_start: plan.week_start,
    });
    alert('Week comped successfully');
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const activePlans = plans.filter(p => p.status === 'active');
  const totalRevenue = activePlans.reduce((s, p) => s + p.price_cents, 0);

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Active Plans</h1>
            <p className="text-gray-600">{activePlans.length} active plans &middot; {formatCents(totalRevenue)}/week revenue</p>
          </div>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Parent</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Child</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Nights/Wk</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Price</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {plans.map(p => (
                <tr key={p.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">{p.parent?.first_name} {p.parent?.last_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{p.child?.first_name} {p.child?.last_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{p.nights_per_week}</td>
                  <td className="px-6 py-4 text-sm font-semibold">{formatCents(p.price_cents)}/wk</td>
                  <td className="px-6 py-4">
                    <span className={p.status === 'active' ? 'badge-green' : p.status === 'paused' ? 'badge-yellow' : 'badge-red'}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      {p.status === 'active' && (
                        <button onClick={() => updatePlanStatus(p.id, 'paused')} className="p-1 text-yellow-600 hover:text-yellow-800" title="Pause">
                          <Pause className="h-4 w-4" />
                        </button>
                      )}
                      {p.status === 'paused' && (
                        <button onClick={() => updatePlanStatus(p.id, 'active')} className="p-1 text-green-600 hover:text-green-800" title="Reactivate">
                          <DollarSign className="h-4 w-4" />
                        </button>
                      )}
                      {p.status !== 'cancelled' && (
                        <button onClick={() => updatePlanStatus(p.id, 'cancelled')} className="p-1 text-red-600 hover:text-red-800" title="Cancel">
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                      {p.status === 'active' && (
                        <button onClick={() => compWeek(p)} className="p-1 text-blue-600 hover:text-blue-800" title="Comp a week">
                          <Gift className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
