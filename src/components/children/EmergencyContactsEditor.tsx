'use client';

import { useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { ChildEmergencyContactRow } from '@/types/children';

interface ContactForm {
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  phone_alt: string;
  priority: number;
  authorized_for_pickup: boolean;
}

interface Props {
  childId: string;
  contacts: ChildEmergencyContactRow[];
  onAdd: (contact: ContactForm) => Promise<void>;
  onUpdate: (id: string, contact: ContactForm) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
}

const RELATIONSHIPS = ['Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Sibling', 'Partner', 'Friend', 'Neighbor', 'Other'];

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

function emptyContact(priority: number): ContactForm {
  return {
    first_name: '',
    last_name: '',
    relationship: '',
    phone: '',
    phone_alt: '',
    priority,
    authorized_for_pickup: false,
  };
}

export function EmergencyContactsEditor({ childId, contacts, onAdd, onUpdate, onDelete, saving }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyContact(contacts.length + 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const canAdd = contacts.length < 2;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (!form.relationship) errs.relationship = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    else if (!validatePhone(form.phone)) errs.phone = 'Invalid phone number';
    if (form.priority < 1 || form.priority > 2) errs.priority = 'Must be 1 or 2';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function startEdit(contact: ChildEmergencyContactRow) {
    setForm({
      first_name: contact.first_name,
      last_name: contact.last_name,
      relationship: contact.relationship,
      phone: formatPhoneInput(contact.phone),
      phone_alt: contact.phone_alt || '',
      priority: contact.priority,
      authorized_for_pickup: contact.authorized_for_pickup,
    });
    setEditingId(contact.id);
    setShowForm(true);
    setError('');
  }

  function startAdd() {
    const nextPriority = contacts.length === 0 ? 1 : contacts.some(c => c.priority === 1) ? 2 : 1;
    setForm(emptyContact(nextPriority));
    setEditingId(null);
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setError('');

    try {
      if (editingId) {
        await onUpdate(editingId, form);
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
    if (!confirm('Remove this emergency contact?')) return;
    try {
      await onDelete(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
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

      {contacts.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">No emergency contacts added yet. At least one is recommended.</p>
      )}

      {/* Contact List */}
      {contacts.map(contact => (
        <div key={contact.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="badge badge-blue">Priority {contact.priority}</span>
                <h4 className="font-medium text-gray-900">
                  {contact.first_name} {contact.last_name}
                </h4>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {contact.relationship} &middot; {contact.phone}
                {contact.phone_alt && ` / ${contact.phone_alt}`}
              </p>
              {contact.authorized_for_pickup && (
                <span className="badge badge-green mt-1">Authorized for Pickup</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => startEdit(contact)}
                className="text-sm text-accent-600 hover:text-accent-700 font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(contact.id)}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
          <h4 className="font-medium text-gray-900">
            {editingId ? 'Edit' : 'Add'} Emergency Contact
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) }))}
                className="input-field"
              >
                <option value={1}>1 - Primary</option>
                <option value={2}>2 - Secondary</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alt Phone</label>
              <input
                type="tel"
                value={form.phone_alt}
                onChange={e => setForm(f => ({ ...f, phone_alt: formatPhoneInput(e.target.value) }))}
                className="input-field"
                placeholder="(optional)"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.authorized_for_pickup}
              onChange={e => setForm(f => ({ ...f, authorized_for_pickup: e.target.checked }))}
              className="w-4 h-4 text-accent-600 focus:ring-accent-500 rounded"
            />
            <span className="text-sm font-medium text-gray-700">Also authorized for pickup</span>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Contact'}
            </button>
          </div>
        </form>
      )}

      {!showForm && canAdd && (
        <button
          type="button"
          onClick={startAdd}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" /> Add Emergency Contact
        </button>
      )}

      {!showForm && !canAdd && (
        <p className="text-sm text-gray-500">Maximum of 2 emergency contacts reached.</p>
      )}
    </div>
  );
}
