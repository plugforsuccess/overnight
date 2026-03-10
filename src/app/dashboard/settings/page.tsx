'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LogOut, AlertCircle, Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { AlertCard, PageHeader, SectionCard, StatusBadge, TaskRow } from '@/components/ui/system';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProfileData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string;
}

interface SettingsData {
  email_notifications: boolean;
  sms_notifications: boolean;
  reservation_reminders: boolean;
  billing_reminders: boolean;
  emergency_alerts: boolean;
  require_pickup_pin: boolean;
  notify_on_check_in_out: boolean;
  notify_on_pickup_changes: boolean;
  emergency_contact_reminder: boolean;
  preferred_contact_method: string | null;
  preferred_reminder_timing: string | null;
  staff_notes: string | null;
  language_preference: string | null;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Password form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Preferences form
  const [preferredContact, setPreferredContact] = useState('');
  const [reminderTiming, setReminderTiming] = useState('');
  const [staffNotes, setStaffNotes] = useState('');

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Load data ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/settings', { headers });

        if (!res.ok) throw new Error('Failed to load settings');

        const json = await res.json();
        setProfile(json.profile);
        setSettings(json.settings);

        // Initialize form state
        setFirstName(json.profile.first_name);
        setLastName(json.profile.last_name);
        setPhone(json.profile.phone || '');
        setPreferredContact(json.settings.preferred_contact_method || '');
        setReminderTiming(json.settings.preferred_reminder_timing || '');
        setStaffNotes(json.settings.staff_notes || '');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Save helper ────────────────────────────────────────────────────
  async function saveSection(section: string, data: Record<string, unknown>) {
    setSaving(section);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ section, ...data }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');

      showToast(json.message || 'Saved successfully');
      return json;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(null);
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    await saveSection('profile', {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
    });
    setProfile(prev => prev ? { ...prev, first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() || null } : prev);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    // Check for at least one uppercase, one lowercase, one number
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Password must include uppercase, lowercase, and a number');
      return;
    }

    try {
      await saveSection('password', { new_password: newPassword, confirm_password: confirmPassword });
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      // error already handled in saveSection
    }
  }

  async function handleToggleNotification(field: string, value: boolean) {
    if (!settings) return;
    const updated = { ...settings, [field]: value };
    setSettings(updated);

    try {
      await saveSection('notifications', {
        email_notifications: updated.email_notifications,
        sms_notifications: updated.sms_notifications,
        reservation_reminders: updated.reservation_reminders,
        billing_reminders: updated.billing_reminders,
        emergency_alerts: updated.emergency_alerts,
      });
    } catch {
      // Revert on failure
      setSettings(prev => prev ? { ...prev, [field]: !value } : prev);
    }
  }

  async function handleToggleSafety(field: string, value: boolean) {
    if (!settings) return;
    const updated = { ...settings, [field]: value };
    setSettings(updated);

    try {
      await saveSection('safety', {
        require_pickup_pin: updated.require_pickup_pin,
        notify_on_check_in_out: updated.notify_on_check_in_out,
        notify_on_pickup_changes: updated.notify_on_pickup_changes,
        emergency_contact_reminder: updated.emergency_contact_reminder,
      });
    } catch {
      setSettings(prev => prev ? { ...prev, [field]: !value } : prev);
    }
  }

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    await saveSection('preferences', {
      preferred_contact_method: preferredContact.trim() || null,
      preferred_reminder_timing: reminderTiming.trim() || null,
      staff_notes: staffNotes.trim() || null,
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  async function handleDeleteAccountRequest() {
    if (deleteConfirmText !== 'DELETE') return;
    try {
      await saveSection('delete_account_request', {});
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    } catch {
      // error handled in saveSection
    }
  }

  // ── Loading ────────────────────────────────────────────────────────
  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-slate-500">Loading settings…</div>;
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (!profile || !settings) {
    return (
      <AlertCard tone="red" title="Unable to load settings">
        <p>{error || 'An unexpected error occurred.'}</p>
        <button onClick={() => window.location.reload()} className="mt-2 rounded-md border border-rose-300 px-2 py-1 text-xs">Try again</button>
      </AlertCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Calm controls for account, notifications, family safety, and household preferences."
        actions={<Link href="/dashboard" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Back</Link>}
      />

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" />{toast}</span>
        </div>
      )}

      {error && (
        <AlertCard tone="red" title="We couldn’t save that change">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </AlertCard>
      )}

      <SectionCard title="Account" subtitle="Your parent profile and contact details.">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">First name</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Last name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="input-field" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" value={profile.email} disabled className="input-field bg-slate-50 text-slate-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" />
          </div>
          <button type="submit" disabled={saving === 'profile'} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving === 'profile' ? 'Saving…' : 'Save profile'}</button>
        </form>
      </SectionCard>

      <SectionCard title="Security" subtitle="Password and session controls.">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required className="input-field pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <StatusBadge tone={newPassword.length >= 8 ? 'green' : 'gray'}>8+ chars</StatusBadge>
              <StatusBadge tone={/[A-Z]/.test(newPassword) ? 'green' : 'gray'}>Uppercase</StatusBadge>
              <StatusBadge tone={/[0-9]/.test(newPassword) ? 'green' : 'gray'}>Number</StatusBadge>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="input-field" />
          </div>
          {passwordError && <p className="text-sm text-rose-600">{passwordError}</p>}
          <button type="submit" disabled={saving === 'password' || !newPassword || !confirmPassword} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving === 'password' ? 'Updating…' : 'Update password'}</button>
        </form>
      </SectionCard>

      <SectionCard title="Notifications" subtitle="How you want updates from care staff and billing.">
        <div className="space-y-2">
          <TaskRow title="Email notifications" meta="Booking confirmations and updates" status={<StatusBadge tone={settings.email_notifications ? 'green' : 'gray'}>{settings.email_notifications ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.email_notifications} onChange={(e) => handleToggleNotification('email_notifications', e.target.checked)} />} />
          <TaskRow title="SMS notifications" meta="Coming soon" status={<StatusBadge tone="gray">Planned</StatusBadge>} actions={<input type="checkbox" checked={settings.sms_notifications} disabled />} />
          <TaskRow title="Reservation reminders" status={<StatusBadge tone={settings.reservation_reminders ? 'green' : 'gray'}>{settings.reservation_reminders ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.reservation_reminders} onChange={(e) => handleToggleNotification('reservation_reminders', e.target.checked)} />} />
          <TaskRow title="Billing reminders" status={<StatusBadge tone={settings.billing_reminders ? 'green' : 'gray'}>{settings.billing_reminders ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.billing_reminders} onChange={(e) => handleToggleNotification('billing_reminders', e.target.checked)} />} />
          <TaskRow title="Emergency alerts" meta="Recommended to keep enabled" status={<StatusBadge tone={settings.emergency_alerts ? 'green' : 'gray'}>{settings.emergency_alerts ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.emergency_alerts} onChange={(e) => handleToggleNotification('emergency_alerts', e.target.checked)} />} />
        </div>
      </SectionCard>

      <SectionCard title="Pickup & Safety" subtitle="Controls that protect handoff and safety communications.">
        <div className="space-y-2">
          <TaskRow title="Require pickup PIN" status={<StatusBadge tone={settings.require_pickup_pin ? 'green' : 'gray'}>{settings.require_pickup_pin ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.require_pickup_pin} onChange={(e) => handleToggleSafety('require_pickup_pin', e.target.checked)} />} />
          <TaskRow title="Notify on check-in / check-out" status={<StatusBadge tone={settings.notify_on_check_in_out ? 'green' : 'gray'}>{settings.notify_on_check_in_out ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.notify_on_check_in_out} onChange={(e) => handleToggleSafety('notify_on_check_in_out', e.target.checked)} />} />
          <TaskRow title="Notify on pickup changes" status={<StatusBadge tone={settings.notify_on_pickup_changes ? 'green' : 'gray'}>{settings.notify_on_pickup_changes ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.notify_on_pickup_changes} onChange={(e) => handleToggleSafety('notify_on_pickup_changes', e.target.checked)} />} />
          <TaskRow title="Emergency contact reminder" status={<StatusBadge tone={settings.emergency_contact_reminder ? 'green' : 'gray'}>{settings.emergency_contact_reminder ? 'On' : 'Off'}</StatusBadge>} actions={<input type="checkbox" checked={settings.emergency_contact_reminder} onChange={(e) => handleToggleSafety('emergency_contact_reminder', e.target.checked)} />} />
        </div>
      </SectionCard>

      <SectionCard title="Household preferences" subtitle="Grouped communication choices for your family.">
        <form onSubmit={handleSavePreferences} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Preferred contact method</label>
            <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value)} className="input-field">
              <option value="">No preference</option><option value="email">Email</option><option value="phone">Phone call</option><option value="text">Text message</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Reminder timing</label>
            <select value={reminderTiming} onChange={(e) => setReminderTiming(e.target.value)} className="input-field">
              <option value="">Default</option><option value="1h">1 hour before</option><option value="3h">3 hours before</option><option value="1d">1 day before</option><option value="2d">2 days before</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes for staff</label>
            <textarea value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} rows={3} maxLength={1000} className="input-field resize-none" />
          </div>
          <button type="submit" disabled={saving === 'preferences'} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving === 'preferences' ? 'Saving…' : 'Save preferences'}</button>
        </form>
      </SectionCard>

      <SectionCard title="Account actions" subtitle="Session and irreversible account actions.">
        <div className="space-y-3">
          <TaskRow title="Log out" meta="Sign out of this device" status={<StatusBadge tone="gray">Session</StatusBadge>} actions={<button onClick={handleLogout} className="rounded-md border border-slate-200 px-2 py-1 text-xs"> <LogOut className="mr-1 inline h-3 w-3" />Log out</button>} />
          {!showDeleteConfirm ? (
            <TaskRow title="Request account deletion" meta="Permanent removal processed within 5 business days" status={<StatusBadge tone="red">Danger</StatusBadge>} actions={<button onClick={() => setShowDeleteConfirm(true)} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">Request</button>} />
          ) : (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="mb-2 text-sm text-rose-700">Type DELETE to confirm.</p>
              <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} className="input-field mb-2" />
              <div className="flex gap-2">
                <button onClick={handleDeleteAccountRequest} disabled={deleteConfirmText !== 'DELETE' || saving === 'delete_account_request'} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">{saving === 'delete_account_request' ? 'Submitting…' : 'Confirm deletion request'}</button>
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
