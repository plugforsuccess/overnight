'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, ShieldX, Lock, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

interface ChildOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface PickupPerson {
  id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  id_verified: boolean;
  id_verified_at: string | null;
}

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
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  // Load children list
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/admin/pickup-verification', { headers });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setChildren(data.children || []);
      } catch {
        // handled by empty state
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Load pickups when child selected
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId]);

  async function handleVerify() {
    if (!selectedPickupId || !pin) return;
    setVerifying(true);
    setResult(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/pickup-verification', {
        method: 'POST',
        headers,
        body: JSON.stringify({ pickupId: selectedPickupId, pin }),
      });
      const data = await res.json();
      setResult({ verified: data.verified, message: data.message || data.error });
      setPin('');

      // Refresh pickups to reflect id_verified status
      if (data.verified) {
        const refreshRes = await fetch(`/api/admin/pickup-verification?childId=${selectedChildId}`, { headers });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setPickups(refreshData.pickups || []);
        }
      }
    } catch {
      setResult({ verified: false, message: 'Verification failed. Please try again.' });
    }
    setVerifying(false);
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedChildId);
  const selectedPickup = pickups.find(p => p.id === selectedPickupId);

  return (
    <div className="py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pickup Verification</h1>
            <p className="text-gray-600">Verify authorized pickup persons by PIN or photo ID</p>
          </div>
        </div>

        <div className="card space-y-6">
          {/* Step 1: Select Child */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Child</label>
            <select
              value={selectedChildId}
              onChange={e => setSelectedChildId(e.target.value)}
              className="input-field"
            >
              <option value="">Choose a child...</option>
              {children.map(child => (
                <option key={child.id} value={child.id}>
                  {child.first_name} {child.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Select Authorized Pickup */}
          {selectedChildId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Authorized Pickups for {selectedChild?.first_name}
              </label>
              {pickups.length === 0 ? (
                <p className="text-sm text-gray-500">No authorized pickups found for this child.</p>
              ) : (
                <div className="space-y-2">
                  {pickups.map(pickup => (
                    <button
                      key={pickup.id}
                      onClick={() => { setSelectedPickupId(pickup.id); setPin(''); setResult(null); }}
                      className={`w-full text-left p-3 border rounded-lg transition-colors ${
                        selectedPickupId === pickup.id
                          ? 'border-accent-500 bg-accent-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium text-gray-900">
                            {pickup.first_name} {pickup.last_name}
                          </span>
                          <span className="text-sm text-gray-500 ml-2">{pickup.relationship}</span>
                        </div>
                        {pickup.id_verified && (
                          <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-1 rounded-full">
                            <ShieldCheck className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{pickup.phone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Enter PIN */}
          {selectedPickupId && (
            <div className="border-t pt-6">
              <h3 className="font-medium text-gray-900 mb-4">
                Verify {selectedPickup?.first_name} {selectedPickup?.last_name}
              </h3>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enter Pickup PIN</label>
                  <input
                    type="text"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input-field text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="----"
                    maxLength={6}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleVerify}
                  disabled={verifying || pin.length < 4}
                  className="btn-primary py-2.5"
                >
                  {verifying ? 'Verifying...' : 'Verify'}
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-2">
                If PIN is unavailable, verify using photo ID instead.
              </p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-4 flex items-start gap-3 ${
              result.verified
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              {result.verified ? (
                <ShieldCheck className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
              ) : result.message.includes('locked') ? (
                <Lock className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
              ) : (
                <ShieldX className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-semibold ${result.verified ? 'text-green-800' : 'text-red-800'}`}>
                  {result.verified ? 'APPROVED' : 'DENIED'}
                </p>
                <p className={`text-sm ${result.verified ? 'text-green-700' : 'text-red-700'}`}>
                  {result.message}
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {children.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No children enrolled</h3>
              <p className="text-gray-500">There are no children in the system yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
