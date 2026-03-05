'use client';

import { useState } from 'react';
import { Plus, Trash2, Key, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { ChildAuthorizedPickupRow } from '@/types/children';

// Omit the hash from the row type for display
type PickupDisplay = Omit<ChildAuthorizedPickupRow, 'pickup_pin_hash'>;

interface PickupForm {
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  pickup_pin: string;
  notes: string;
}

interface Props {
  childId: string;
  pickups: PickupDisplay[];
  onAdd: (pickup: PickupForm) => Promise<void>;
  onUpdate: (id: string, pickup: Partial<PickupForm>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}

const RELATIONSHIPS = ['Parent', 'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Nanny', 'Family Friend', 'Neighbor', 'Other'];

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function emptyForm(): PickupForm {
  return { first_name: '', last_name: '', relationship: '', phone: '', pickup_pin: '', notes: '' };
}

export function AuthorizedPickupsEditor({ childId, pickups, onAdd, onUpdate, onDelete, saving }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PickupForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [resetPinId, setResetPinId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');

  function validate(isEdit: boolean): boolean {
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (!form.relationship) errs.relationship = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    else {
      const digits = form.phone.replace(/\D/g, '');
      if (digits.length < 10) errs.phone = 'Invalid phone';
    }
    if (!isEdit && !/^\d{4,6}$/.test(form.pickup_pin)) {
      errs.pickup_pin = 'PIN must be 4-6 digits';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function startEdit(pickup: PickupDisplay) {
    setForm({
      first_name: pickup.first_name,
      last_name: pickup.last_name,
      relationship: pickup.relationship,
      phone: formatPhoneInput(pickup.phone),
      pickup_pin: '', // never pre-fill PIN
      notes: pickup.notes || '',
    });
    setEditingId(pickup.id);
    setShowForm(true);
    setError('');
  }

  function startAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isEdit = !!editingId;
    if (!validate(isEdit)) return;
    setError('');

    try {
      if (editingId) {
        await onUpdate(editingId, {
          first_name: form.first_name,
          last_name: form.last_name,
          relationship: form.relationship,
          phone: form.phone,
          notes: form.notes,
        });
      } else {
        await onAdd(form);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this authorized pickup person?')) return;
    try {
      await onDelete(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    }
  }

  async function handleResetPin(id: string) {
    if (!/^\d{4,6}$/.test(newPin)) {
      setError('PIN must be 4-6 digits');
      return;
    }
    try {
      await onUpdate(id, { pickup_pin: newPin });
      setResetPinId(null);
      setNewPin('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset PIN');
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {pickups.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">No authorized pickups added yet.</p>
      )}

      {/* Pickup List */}
      {pickups.map(pickup => (
        <div key={pickup.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-gray-900">
                  {pickup.first_name} {pickup.last_name}
                </h4>
                {pickup.id_verified && (
                  <span className="badge badge-green flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> ID Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {pickup.relationship} &middot; {pickup.phone}
              </p>
              {pickup.notes && (
                <p className="text-sm text-gray-500 mt-1">Notes: {pickup.notes}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startEdit(pickup)}
                className="text-sm text-accent-600 hover:text-accent-700 font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => { setResetPinId(pickup.id); setNewPin(''); setError(''); }}
                className="p-1 text-gray-500 hover:text-gray-700"
                title="Reset PIN"
              >
                <Key className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(pickup.id)}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Reset PIN inline form */}
          {resetPinId === pickup.id && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3">
              <input
                type="text"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-field w-32"
                placeholder="New PIN"
                maxLength={6}
              />
              <button
                onClick={() => handleResetPin(pickup.id)}
                disabled={saving}
                className="btn-primary text-sm py-1.5"
              >
                {saving ? '...' : 'Set PIN'}
              </button>
              <button
                onClick={() => setResetPinId(null)}
                className="btn-secondary text-sm py-1.5"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h4 className="font-medium text-gray-900">
            {editingId ? 'Edit' : 'Add'} Authorized Pickup
          </h4>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                className="input-field"
                required
              />
              {errors.first_name && <p className="mt-1 text-sm text-red-600">{errors.first_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                className="input-field"
                required
              />
              {errors.last_name && <p className="mt-1 text-sm text-red-600">{errors.last_name}</p>}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Relationship *</label>
              <select
                value={form.relationship}
                onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Select...</option>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {errors.relationship && <p className="mt-1 text-sm text-red-600">{errors.relationship}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
                className="input-field"
                placeholder="(404) 555-0123"
                required
              />
              {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
            </div>
          </div>

          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup PIN * (4-6 digits)</label>
              <input
                type="text"
                value={form.pickup_pin}
                onChange={e => setForm(f => ({ ...f, pickup_pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className="input-field w-32"
                placeholder="1234"
                maxLength={6}
                required
              />
              <p className="text-xs text-gray-400 mt-1">This PIN will be required for verification during pickup.</p>
              {errors.pickup_pin && <p className="mt-1 text-sm text-red-600">{errors.pickup_pin}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input-field min-h-[60px] resize-none"
              placeholder="Any additional info..."
              maxLength={500}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Pickup'}
            </button>
          </div>
        </form>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={startAdd}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" /> Add Authorized Pickup
        </button>
      )}
    </div>
  );
}
