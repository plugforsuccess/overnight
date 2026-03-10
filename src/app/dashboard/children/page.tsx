'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Plus, Trash2, AlertCircle, ShieldCheck, HeartHandshake } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { AlertCard, ChildCard, EmptyState, PageHeader, SectionCard, StatusBadge, Timeline, TimelineItem } from '@/components/ui/system';
import type {
  ChildRow,
  ChildWithDetails,
} from '@/types/children';

import { ChildFormBasics } from '@/components/children/ChildFormBasics';
import { ChildAllergiesEditor } from '@/components/children/ChildAllergiesEditor';
import { EmergencyContactsEditor } from '@/components/children/EmergencyContactsEditor';
import { AuthorizedPickupsEditor } from '@/components/children/AuthorizedPickupsEditor';
import { MedicalProfileEditor } from '@/components/children/MedicalProfileEditor';
import { ImmunizationPanel } from '@/components/children/ImmunizationPanel';
import { MedicationAuthorizationEditor } from '@/components/children/MedicationAuthorizationEditor';
import { ChildDocumentsPanel } from '@/components/children/ChildDocumentsPanel';

type Tab = 'basics' | 'physician' | 'allergies' | 'emergency' | 'pickups' | 'immunization' | 'medications' | 'documents';
const TABS: { key: Tab; label: string }[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'physician', label: 'Physician' },
  { key: 'allergies', label: 'Allergies & Plans' },
  { key: 'emergency', label: 'Emergency Contacts' },
  { key: 'pickups', label: 'Authorized Pickups' },
  { key: 'immunization', label: 'Immunization' },
  { key: 'medications', label: 'Medications' },
  { key: 'documents', label: 'Documents' },
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
  const [activity, setActivity] = useState<any[]>([]);

  // -- Auth token helper --
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

  // -- Load children list --
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: parentRow } = await supabase
        .from('parents')
        .select('id')
        .eq('id', user.id)
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

  // -- Load child details --
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

  useEffect(() => {
    async function loadActivity(childId: string) {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/dashboard/children/${childId}/activity`, { headers });
        const data = await res.json();
        if (res.ok) setActivity(data.events || []);
      } catch {}
    }
    if (selectedId) loadActivity(selectedId);
    else setActivity([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // -- CRUD handlers --

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



  function handleDocumentUploaded(doc: any) {
    setSelectedChild(prev => prev ? { ...prev, documents: [doc, ...(prev.documents || [])] } : prev);
    showToast('Document uploaded');
  }

  function handleDocumentDeleted(id: string) {
    setSelectedChild(prev => prev ? { ...prev, documents: (prev.documents || []).filter((d: any) => d.id !== id) } : prev);
    showToast('Document deleted');
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

  // -- Medical profile --
  async function handleSaveMedicalProfile(profileData: any) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${selectedId}/medical-profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? { ...prev, medical_profile: data.profile } : null);
      showToast('Medical profile saved');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // -- Immunization --
  async function handleSaveImmunization(recordData: any) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${selectedId}/immunization`, {
        method: 'POST',
        headers,
        body: JSON.stringify(recordData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? { ...prev, immunization_record: data.record } : null);
      showToast('Immunization record saved');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // -- Medications --
  async function handleAddMedication(medData: any) {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/children/${selectedId}/medications`, {
        method: 'POST',
        headers,
        body: JSON.stringify(medData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedChild(prev => prev ? {
        ...prev,
        medication_authorizations: [data.medication, ...prev.medication_authorizations],
      } : null);
      showToast('Medication authorized');
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMedication(id: string) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/medications/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setSelectedChild(prev => prev ? {
        ...prev,
        medication_authorizations: prev.medication_authorizations.filter(m => m.id !== id),
      } : null);
      showToast('Medication authorization removed');
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

  // -- Render --

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
    <div className="space-y-6">
      <PageHeader
        title="Your Children"
        subtitle="Keep each child profile complete so check-in, pickups, and care notes stay trusted and smooth."
        actions={(
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Back</Link>
            <button onClick={handleAddChild} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
              <Plus className="h-4 w-4" /> Add child
            </button>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard title="Family trust" subtitle="What staff rely on every night.">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Children in profile</span>
            <StatusBadge tone={children.length > 0 ? 'green' : 'gray'}>{children.length}</StatusBadge>
          </div>
          <p className="mt-3 text-sm text-slate-600">Emergency contacts, pickup permissions, and medications are kept per child so care stays accurate.</p>
        </SectionCard>
        <SectionCard title="Safety-first records" subtitle="Maintain up-to-date medical and pickup info.">
          <div className="flex items-center gap-2 text-sm text-slate-700"><ShieldCheck className="h-4 w-4 text-emerald-600" />Profiles are tied to secure account auth.</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-700"><HeartHandshake className="h-4 w-4 text-sky-600" />Staff see your latest approved details on duty.</div>
        </SectionCard>
        <SectionCard title="Typical setup flow" subtitle="Most families complete profiles in this order.">
          <Timeline>
            <TimelineItem title="Add basic info" tone="blue" />
            <TimelineItem title="Set emergency and pickup contacts" tone="yellow" />
            <TimelineItem title="Upload medical docs and meds" tone="green" />
          </Timeline>
        </SectionCard>
      </div>

        {/* Toast */}
      {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
            {toast}
          </div>
      )}

        {/* Global Error */}
      {error && (
        <AlertCard tone="red" title="We couldn’t update this profile yet">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto">Dismiss</button>
          </div>
        </AlertCard>
      )}

        {/* Empty state */}
      {children.length === 0 ? (
        <EmptyState
          title="No child profiles yet"
          description="Start with your first child profile to unlock booking and complete safety records."
          action={<button onClick={handleAddChild} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"><UserPlus className="h-4 w-4" />Add your first child</button>}
        />
      ) : (
        <div className="flex gap-6">
            {/* Left pane: children list */}
            <div className="w-80 flex-shrink-0 space-y-3">
              {children.map(child => (
                <div
                  key={child.id}
                  onClick={() => { setSelectedId(child.id); setActiveTab('basics'); }}
                  className={`cursor-pointer rounded-2xl border bg-white p-3 shadow-sm transition-all ${
                    selectedId === child.id
                      ? 'ring-2 ring-sky-400 border-sky-300'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <ChildCard
                      name={`${child.first_name} ${child.last_name}`}
                      details={<span>DOB: {child.date_of_birth}</span>}
                      status={<StatusBadge tone={selectedId === child.id ? 'blue' : 'gray'}>{selectedId === child.id ? 'Open' : 'Ready'}</StatusBadge>}
                    />
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
                <SectionCard title="Loading child profile" subtitle="Fetching latest details.">
                  <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-48" />
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                  </div>
                </SectionCard>
              ) : selectedChild ? (
                <SectionCard title={`${selectedChild.first_name} ${selectedChild.last_name}`} subtitle="Profile details and care records">
                  {/* Tabs */}
                  <div className="flex border-b mb-6 -mt-2 gap-1 overflow-x-auto">
                    {TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

                  {activeTab === 'physician' && (
                    <MedicalProfileEditor
                      childId={selectedChild.id}
                      profile={selectedChild.medical_profile}
                      onSave={handleSaveMedicalProfile}
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

                  {activeTab === 'immunization' && (
                    <ImmunizationPanel
                      childId={selectedChild.id}
                      record={selectedChild.immunization_record}
                      onSave={handleSaveImmunization}
                      saving={saving}
                    />
                  )}

                  {activeTab === 'medications' && (
                    <MedicationAuthorizationEditor
                      childId={selectedChild.id}
                      medications={selectedChild.medication_authorizations}
                      onAdd={handleAddMedication}
                      onDelete={handleDeleteMedication}
                      saving={saving}
                    />
                  )}

                  {activeTab === 'documents' && (
                    <ChildDocumentsPanel
                      childId={selectedChild.id}
                      documents={selectedChild.documents || []}
                      onUploaded={handleDocumentUploaded}
                      onDeleted={handleDocumentDeleted}
                    />
                  )}
                </SectionCard>
              ) : null}
          </div>
          </div>
      )}
    </div>
  );
}
