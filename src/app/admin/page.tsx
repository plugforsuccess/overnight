'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Users, DollarSign, Clock, Settings, List } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatCents } from '@/lib/constants';

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState({ activePlansCount: 0, totalChildren: 0, weeklyRevenue: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      // Fetch stats directly
      const [plansRes, childrenRes] = await Promise.all([
        supabase.from('plans').select('price_cents').eq('status', 'active'),
        supabase.from('children').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        activePlansCount: plansRes.data?.length ?? 0,
        totalChildren: childrenRes.count ?? 0,
        weeklyRevenue: plansRes.data?.reduce((s, p) => s + p.price_cents, 0) ?? 0,
      });
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600 mb-8">Manage your DreamWatch Overnight program</p>

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="card flex items-center gap-3">
            <Users className="h-8 w-8 text-brand-600" />
            <div>
              <div className="text-2xl font-bold">{stats.activePlansCount}</div>
              <div className="text-sm text-gray-500">Active Plans</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Users className="h-8 w-8 text-night-600" />
            <div>
              <div className="text-2xl font-bold">{stats.totalChildren}</div>
              <div className="text-sm text-gray-500">Total Children</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold">{formatCents(stats.weeklyRevenue)}</div>
              <div className="text-sm text-gray-500">Weekly Revenue</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/roster" className="card hover:shadow-md transition-shadow text-center">
            <Calendar className="h-10 w-10 text-night-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Nightly Roster</div>
            <div className="text-sm text-gray-500">View children by night</div>
          </Link>
          <Link href="/admin/plans" className="card hover:shadow-md transition-shadow text-center">
            <List className="h-10 w-10 text-brand-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Active Plans</div>
            <div className="text-sm text-gray-500">View & manage plans</div>
          </Link>
          <Link href="/admin/waitlist" className="card hover:shadow-md transition-shadow text-center">
            <Clock className="h-10 w-10 text-yellow-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Waitlist</div>
            <div className="text-sm text-gray-500">Manage waitlisted families</div>
          </Link>
          <Link href="/admin/settings" className="card hover:shadow-md transition-shadow text-center">
            <Settings className="h-10 w-10 text-gray-600 mx-auto mb-3" />
            <div className="font-semibold text-gray-900">Settings</div>
            <div className="text-sm text-gray-500">Capacity, pricing, hours</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
