'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Users, CreditCard, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatCents, DAY_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { Plan, Reservation, WaitlistEntry, Profile } from '@/types/database';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const [profileRes, plansRes, reservationsRes, waitlistRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('plans').select('*, child:children(*)').eq('parent_id', user.id).order('created_at', { ascending: false }),
        supabase.from('reservations').select('*, child:children(*)').eq('parent_id', user.id).eq('status', 'confirmed').order('night_date', { ascending: true }),
        supabase.from('waitlist').select('*, child:children(*)').eq('parent_id', user.id).in('status', ['waiting', 'offered']),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (plansRes.data) setPlans(plansRes.data);
      if (reservationsRes.data) setReservations(reservationsRes.data);
      if (waitlistRes.data) setWaitlist(waitlistRes.data);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>;
  }

  const activePlans = plans.filter(p => p.status === 'active');
  const upcomingReservations = reservations.filter(r => r.night_date >= new Date().toISOString().split('T')[0]);

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Parent Dashboard</h1>
            <p className="text-gray-600">Welcome back, {profile?.full_name}</p>
          </div>
          <Link href="/schedule" className="btn-primary">
            Reserve Nights
          </Link>
        </div>

        {/* Quick Stats */}
        <div className="grid sm:grid-cols-4 gap-4 mb-8">
          <div className="card flex items-center gap-3">
            <Calendar className="h-8 w-8 text-night-600" />
            <div>
              <div className="text-2xl font-bold">{upcomingReservations.length}</div>
              <div className="text-sm text-gray-500">Upcoming Nights</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Users className="h-8 w-8 text-brand-600" />
            <div>
              <div className="text-2xl font-bold">{activePlans.length}</div>
              <div className="text-sm text-gray-500">Active Plans</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold">
                {formatCents(activePlans.reduce((s, p) => s + p.price_cents, 0))}
              </div>
              <div className="text-sm text-gray-500">Weekly Total</div>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div>
              <div className="text-2xl font-bold">{waitlist.length}</div>
              <div className="text-sm text-gray-500">On Waitlist</div>
            </div>
          </div>
        </div>

        {/* Waitlist Alerts */}
        {waitlist.filter(w => w.status === 'offered').length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-8">
            <div className="flex items-center gap-2 text-yellow-800 font-semibold mb-2">
              <AlertCircle className="h-5 w-5" />
              Waitlist Spot Available!
            </div>
            {waitlist.filter(w => w.status === 'offered').map(w => (
              <div key={w.id} className="text-yellow-700">
                A spot opened up for {(w as WaitlistEntry & { child: { full_name: string } }).child?.full_name} on {formatDate(w.night_date)}.
                Please confirm within the deadline.
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upcoming Reservations */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upcoming Nights</h2>
            {upcomingReservations.length === 0 ? (
              <p className="text-gray-500">No upcoming reservations. <Link href="/schedule" className="text-brand-600">Reserve now</Link></p>
            ) : (
              <div className="space-y-3">
                {upcomingReservations.slice(0, 10).map(r => (
                  <div key={r.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-semibold text-gray-900">{formatDate(r.night_date)}</div>
                      <div className="text-sm text-gray-500">{(r as Reservation & { child: { full_name: string } }).child?.full_name} — 9 PM to 7 AM</div>
                    </div>
                    <span className="badge-green">Confirmed</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Plans */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Plans</h2>
            {activePlans.length === 0 ? (
              <p className="text-gray-500">No active plans. <Link href="/schedule" className="text-brand-600">Create one</Link></p>
            ) : (
              <div className="space-y-3">
                {activePlans.map(p => (
                  <div key={p.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-gray-900">
                          {(p as Plan & { child: { full_name: string } }).child?.full_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {p.nights_per_week} night{p.nights_per_week > 1 ? 's' : ''}/week
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">{formatCents(p.price_cents)}/wk</div>
                        <span className="badge-green">{p.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <Link href="/dashboard/children" className="card hover:shadow-md transition-shadow text-center">
            <Users className="h-8 w-8 text-night-600 mx-auto mb-2" />
            <div className="font-semibold">Manage Children</div>
            <div className="text-sm text-gray-500">Add/edit child profiles</div>
          </Link>
          <Link href="/dashboard/payments" className="card hover:shadow-md transition-shadow text-center">
            <CreditCard className="h-8 w-8 text-night-600 mx-auto mb-2" />
            <div className="font-semibold">Payment History</div>
            <div className="text-sm text-gray-500">View invoices & payments</div>
          </Link>
          <Link href="/schedule" className="card hover:shadow-md transition-shadow text-center">
            <Calendar className="h-8 w-8 text-night-600 mx-auto mb-2" />
            <div className="font-semibold">Reserve Nights</div>
            <div className="text-sm text-gray-500">Book for next week</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
