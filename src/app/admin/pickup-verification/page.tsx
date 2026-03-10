'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { EmptyState, PageHeader, PickupVerificationCard, SectionCard, StatusBadge } from '@/components/ui/system';

interface ChildOption { id: string; first_name: string; last_name: string; }
interface PickupPerson { id: string; first_name: string; last_name: string; relationship: string; phone: string; id_verified: boolean; id_verified_at: string | null; }

export default function PickupVerificationPage() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [pickups, setPickups] = useState<PickupPerson[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ verified: boolean; message: string } | null>(null);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/admin/pickup-verification', { headers });
        if (res.ok) {
          const data = await res.json();
          setChildren(data.children || []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  useEffect(() => {
    if (!selectedChildId) { setPickups([]); return; }
    async function loadPickups() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/admin/pickup-verification?childId=${selectedChildId}`, { headers });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setPickups(data.pickups || []);
        setSelectedPickupId('');
        setPin('');
        setResult(null);
      } catch {
        setPickups([]);
      }
    }
    loadPickups();
  }, [selectedChildId]);

  async function handleVerify() {
    if (!selectedPickupId || !pin) return;
    setVerifying(true);
    setResult(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/pickup-verification', { method: 'POST', headers, body: JSON.stringify({ pickupId: selectedPickupId, pin }) });
      const data = await res.json();
      setResult({ verified: data.verified, message: data.message || data.error });
      setPin('');
    } catch {
      setResult({ verified: false, message: 'Verification failed. Please try again.' });
    }
    setVerifying(false);
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;
  const selectedChild = children.find((c) => c.id === selectedChildId);

  return (
    <div className="space-y-6">
      <PageHeader title="Pickup Verification" subtitle="Verify authorized pickup people by PIN with status-first approvals" />
      <SectionCard title="Verification Queue">
        {children.length === 0 ? <EmptyState title="No children enrolled" description="There are no children in the system yet." /> : (
          <div className="space-y-4">
            <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)} className="input-field">
              <option value="">Choose a child…</option>
              {children.map((child) => <option key={child.id} value={child.id}>{child.first_name} {child.last_name}</option>)}
            </select>

            {selectedChildId && (
              <div className="space-y-3">
                {pickups.map((pickup) => (
                  <button key={pickup.id} onClick={() => setSelectedPickupId(pickup.id)} className="w-full text-left">
                    <PickupVerificationCard
                      name={`${pickup.first_name} ${pickup.last_name}`}
                      note={`${pickup.relationship} · ${pickup.phone} · Child: ${selectedChild?.first_name}`}
                      status={<StatusBadge tone={pickup.id_verified ? 'green' : 'yellow'}>{pickup.id_verified ? 'verified' : 'pending verification'}</StatusBadge>}
                    />
                  </button>
                ))}
              </div>
            )}

            {selectedPickupId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-medium text-slate-800">Enter pickup PIN</p>
                <div className="flex gap-2">
                  <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input-field text-center font-mono" maxLength={6} />
                  <button onClick={handleVerify} disabled={verifying || pin.length < 4} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">{verifying ? 'Verifying…' : 'Verify'}</button>
                </div>
              </div>
            )}

            {result && <StatusBadge tone={result.verified ? 'green' : 'red'}>{result.verified ? 'approved' : 'denied'} · {result.message}</StatusBadge>}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
