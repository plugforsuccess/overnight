'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, UserCheck, XCircle, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { formatDate } from '@/lib/utils';
import { WaitlistEntry } from '@/types/database';

export default function AdminWaitlistPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data } = await supabase
        .from('waitlist')
        .select('*, child:children(*), parent:parents(*)')
        .in('status', ['waiting', 'offered'])
        .order('night_date')
        .order('position');

      if (data) setEntries(data);
      setLoading(false);
    }
    load();
  }, [router]);

  async function promoteEntry(entry: WaitlistEntry) {
    // Find an active plan for this child
    const { data: plan } = await supabase
      .from('plans')
      .select('id')
      .eq('child_id', entry.child_id)
      .eq('status', 'active')
      .limit(1)
      .single();

    // Create reservation
    await supabase.from('reservations').insert({
      child_id: entry.child_id,
      parent_id: entry.parent_id,
      plan_id: plan?.id || entry.id,
      night_date: entry.night_date,
      status: 'confirmed',
    });

    // Update waitlist
    await supabase.from('waitlist').update({ status: 'confirmed' }).eq('id', entry.id);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
  }

  async function offerSpot(entry: WaitlistEntry) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await supabase.from('waitlist').update({
      status: 'offered',
      offered_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    }).eq('id', entry.id);

    setEntries(prev => prev.map(e =>
      e.id === entry.id ? { ...e, status: 'offered' as const, offered_at: new Date().toISOString(), expires_at: expiresAt.toISOString() } : e
    ));
  }

  async function cancelEntry(id: string) {
    await supabase.from('waitlist').update({ status: 'cancelled' }).eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Waitlist Management</h1>
            <p className="text-gray-600">{entries.length} entries waiting</p>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 text-lg">No one on the waitlist right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map(entry => (
              <div key={entry.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{entry.child?.first_name} {entry.child?.last_name}</h3>
                    <p className="text-sm text-gray-500">Parent: {entry.parent?.first_name} {entry.parent?.last_name}</p>
                    <p className="text-sm text-gray-500">Night: {formatDate(entry.night_date)}</p>
                    <p className="text-sm text-gray-500">Position: #{entry.position}</p>
                    {entry.status === 'offered' && (
                      <p className="text-sm text-yellow-600 font-medium mt-1">
                        Offer sent — expires {entry.expires_at ? formatDate(entry.expires_at) : 'N/A'}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={entry.status === 'offered' ? 'badge-yellow' : 'badge-blue'}>
                      {entry.status}
                    </span>
                    <div className="flex gap-1">
                      {entry.status === 'waiting' && (
                        <button onClick={() => offerSpot(entry)} className="p-1 text-blue-600 hover:text-blue-800" title="Offer spot">
                          <Bell className="h-5 w-5" />
                        </button>
                      )}
                      <button onClick={() => promoteEntry(entry)} className="p-1 text-green-600 hover:text-green-800" title="Confirm & add to roster">
                        <UserCheck className="h-5 w-5" />
                      </button>
                      <button onClick={() => cancelEntry(entry.id)} className="p-1 text-red-600 hover:text-red-800" title="Remove from waitlist">
                        <XCircle className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
