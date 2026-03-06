'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, ArrowLeft, Trash2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import type {
  ChildRow,
  ChildWithDetails,
} from '@/types/children';

import { ChildFormBasics } from '@/components/children/ChildFormBasics';
import { ChildAllergiesEditor } from '@/components/children/ChildAllergiesEditor';
import { EmergencyContactsEditor } from '@/components/children/EmergencyContactsEditor';
import { AuthorizedPickupsEditor } from '@/components/children/AuthorizedPickupsEditor';

type Tab = 'basics' | 'allergies' | 'emergency' | 'pickups';
const TABS: { key: Tab; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'allergies', label: 'Allergies & Plans' },
  { key: 'emergency', label: 'Emergency Contacts' },
  { key: 'pickups', label: 'Authorized Pickups' },
];

export default function ChildrenPage() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChild, setSelectedChild] = useState<ChildWithDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('basics');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // ── Auth token helper ──────────────────────────────────────────────
  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // ── Load children list ─────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Resolve the parents.id (PK) from auth user ID (parents.auth_user_id)
      const { data: parentRow } = await supabase
        .from('parents')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!parentRow) { setLoading(false); return; }

      const { data } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', parentRow.id)
        .order('created_at');

      if (data) setChildren(data);
      setLoading(false);
    }
    load();
  }, [router]);

  // ── Load child details ─────────────────────────────────────────────
  const loadChildDetails = useCallback(async (childId: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${childId}/details`, { headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load child details');
      }
      const data = await res.json();
      setSelectedChild(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadChildDetails(selectedId);
  }, [selectedId, loadChildDetails]);

  // ── CRUD handlers ──────────────────────────────────────────────────

  async function handleAddChild() {
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/children', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          first_name: 'New',
          last_name: 'Child',
          date_of_birth: new Date(new Date().getFullYear() - 3, 0, 1).toISOString().split('T')[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChildren(prev => [...prev, data.child]);
      setSelectedId(data.child.id);
      setActiveTab('basics');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBasics(basics: { first_name: string; last_name: string; date_of_birth: string; medical_notes: string }) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/children', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ id: selectedId, ...basics }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChildren(prev => prev.map(c => c.id === selectedId ? data.child : c));
      setSelectedChild(prev => prev ? { ...prev, ...data.child } : null);
      showToast('Saved');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAllergies(allergies: any[]) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${selectedId}/allergies`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ allergies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? { ...prev, allergies: data.allergies } : null);
      showToast('Allergies saved');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddContact(contact: any) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${selectedId}/emergency-contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(contact),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? {
        ...prev,
        emergency_contacts: [...prev.emergency_contacts, data.contact],
      } : null);
      showToast('Contact added');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateContact(id: string, contact: any) {
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/emergency-contacts/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(contact),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? {
        ...prev,
        emergency_contacts: prev.emergency_contacts.map(c => c.id === id ? data.contact : c),
      } : null);
      showToast('Contact updated');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteContact(id: string) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/emergency-contacts/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setSelectedChild(prev => prev ? {
        ...prev,
        emergency_contacts: prev.emergency_contacts.filter(c => c.id !== id),
      } : null);
      showToast('Contact removed');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPickup(pickup: any) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${selectedId}/authorized-pickups`, {
        method: 'POST',
        headers,
        body: JSON.stringify(pickup),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? {
        ...prev,
        authorized_pickups: [...prev.authorized_pickups, data.pickup],
      } : null);
      showToast('Pickup added');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdatePickup(id: string, pickup: any) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/authorized-pickups/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(pickup),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? {
        ...prev,
        authorized_pickups: prev.authorized_pickups.map(p => p.id === id ? data.pickup : p),
      } : null);
      showToast('Pickup updated');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePickup(id: string) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/authorized-pickups/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setSelectedChild(prev => prev ? {
        ...prev,
        authorized_pickups: prev.authorized_pickups.filter(p => p.id !== id),
      } : null);
      showToast('Pickup removed');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteChild(childId: string) {
    if (!confirm('Are you sure you want to remove this child? All related data will be deleted.')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children?id=${childId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setChildren(prev => prev.filter(c => c.id !== childId));
      if (selectedId === childId) {
        setSelectedId(null);
        setSelectedChild(null);
      }
      showToast('Child removed');
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500">
        <div className="space-y-3 w-full max-w-4xl px-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card animate-pulse h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Manage Children</h1>
            <p className="text-gray-600">Add and manage your children&apos;s profiles</p>
          </div>
          <button onClick={handleAddChild} disabled={saving} className="btn-primary flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Child
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
            {toast}
          </div>
        )}

        {/* Global Error */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {/* Empty state */}
        {children.length === 0 ? (
          <div className="card text-center py-12">
            <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No children added yet</h3>
            <p className="text-gray-500 mb-4">Add your child&apos;s profile to start booking nights.</p>
            <button onClick={handleAddChild} disabled={saving} className="btn-primary">
              Add Your First Child
            </button>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Left pane: children list */}
            <div className="w-72 flex-shrink-0 space-y-3">
              {children.map(child => (
                <div
                  key={child.id}
                  onClick={() => { setSelectedId(child.id); setActiveTab('basics'); }}
                  className={`card cursor-pointer transition-all ${
                    selectedId === child.id
                      ? 'ring-2 ring-accent-500 border-accent-300'
                      : 'hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {child.first_name} {child.last_name}
                      </h3>
                      <p className="text-xs text-gray-500">DOB: {child.date_of_birth}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteChild(child.id); }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Right pane: detail editor */}
            <div className="flex-1 min-w-0">
              {!selectedId ? (
                <div className="card text-center py-12 text-gray-500">
                  Select a child to view and edit their profile
                </div>
              ) : detailLoading ? (
                <div className="card">
                  <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-48" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                  </div>
                </div>
              ) : selectedChild ? (
                <div className="card">
                  {/* Tabs */}
                  <div className="flex border-b mb-6 -mt-2 gap-1">
                    {TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === tab.key
                            ? 'border-accent-500 text-accent-700'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  {activeTab === 'basics' && (
                    <ChildFormBasics
                      child={selectedChild}
                      onSave={handleSaveBasics}
                      saving={saving}
                    />
                  )}

                  {activeTab === 'allergies' && (
                    <ChildAllergiesEditor
                      childId={selectedChild.id}
                      allergies={selectedChild.allergies}
                      onSave={handleSaveAllergies}
                      saving={saving}
                    />
                  )}

                  {activeTab === 'emergency' && (
                    <EmergencyContactsEditor
                      childId={selectedChild.id}
                      contacts={selectedChild.emergency_contacts}
                      onAdd={handleAddContact}
                      onUpdate={handleUpdateContact}
                      onDelete={handleDeleteContact}
                      saving={saving}
                    />
                  )}

                  {activeTab === 'pickups' && (
                    <AuthorizedPickupsEditor
                      childId={selectedChild.id}
                      pickups={selectedChild.authorized_pickups}
                      onAdd={handleAddPickup}
                      onUpdate={handleUpdatePickup}
                      onDelete={handleDeletePickup}
                      saving={saving}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
