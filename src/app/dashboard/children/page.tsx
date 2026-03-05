'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Edit2, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { Child } from '@/types/database';

const emptyChild = {
  full_name: '',
  date_of_birth: '',
  allergies: '',
  medical_notes: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  authorized_pickup: '',
};

export default function ChildrenPage() {
  const router = useRouter();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyChild);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', user.id)
        .order('created_at');

      if (data) setChildren(data);
      setLoading(false);
    }
    load();
  }, [router]);

  function startEdit(child: Child) {
    setForm({
      full_name: child.full_name,
      date_of_birth: child.date_of_birth,
      allergies: child.allergies || '',
      medical_notes: child.medical_notes || '',
      emergency_contact_name: child.emergency_contact_name,
      emergency_contact_phone: child.emergency_contact_phone,
      authorized_pickup: child.authorized_pickup,
    });
    setEditingId(child.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingId) {
      const { data, error: err } = await supabase
        .from('children')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editingId)
        .select()
        .single();

      if (err) { setError(err.message); setSaving(false); return; }
      setChildren(prev => prev.map(c => c.id === editingId ? data : c));
    } else {
      const { data, error: err } = await supabase
        .from('children')
        .insert({ ...form, parent_id: user.id })
        .select()
        .single();

      if (err) { setError(err.message); setSaving(false); return; }
      setChildren(prev => [...prev, data]);
    }

    setShowForm(false);
    setEditingId(null);
    setForm(emptyChild);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this child?')) return;
    await supabase.from('children').delete().eq('id', id);
    setChildren(prev => prev.filter(c => c.id !== id));
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Manage Children</h1>
            <p className="text-gray-600">Add and manage your children&apos;s profiles</p>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyChild); }} className="btn-primary flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Child
          </button>
        </div>

        {/* Child Form */}
        {showForm && (
          <div className="card mb-8">
            <h2 className="text-xl font-semibold mb-4">{editingId ? 'Edit' : 'Add'} Child</h2>
            {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className="input-field" required />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                  <input type="text" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} className="input-field" placeholder="None" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medical Notes</label>
                  <input type="text" value={form.medical_notes} onChange={e => setForm(f => ({ ...f, medical_notes: e.target.value }))} className="input-field" placeholder="None" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Name</label>
                  <input type="text" value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact Phone</label>
                  <input type="tel" value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} className="input-field" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Authorized Pickup (names, separated by commas)</label>
                <input type="text" value={form.authorized_pickup} onChange={e => setForm(f => ({ ...f, authorized_pickup: e.target.value }))} className="input-field" required placeholder="Jane Doe, John Smith" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : editingId ? 'Update Child' : 'Add Child'}</button>
              </div>
            </form>
          </div>
        )}

        {/* Children List */}
        {children.length === 0 && !showForm ? (
          <div className="card text-center py-12">
            <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No children added yet</h3>
            <p className="text-gray-500 mb-4">Add your child&apos;s profile to start booking nights.</p>
            <button onClick={() => setShowForm(true)} className="btn-primary">Add Your First Child</button>
          </div>
        ) : (
          <div className="space-y-4">
            {children.map(child => (
              <div key={child.id} className="card">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{child.full_name}</h3>
                    <p className="text-sm text-gray-500">DOB: {child.date_of_birth}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(child)} className="p-2 text-gray-500 hover:text-gray-700"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(child.id)} className="p-2 text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <span className="text-gray-500">Allergies:</span>{' '}
                    <span className="text-gray-900">{child.allergies || 'None'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Medical Notes:</span>{' '}
                    <span className="text-gray-900">{child.medical_notes || 'None'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Emergency Contact:</span>{' '}
                    <span className="text-gray-900">{child.emergency_contact_name} ({child.emergency_contact_phone})</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Authorized Pickup:</span>{' '}
                    <span className="text-gray-900">{child.authorized_pickup}</span>
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
