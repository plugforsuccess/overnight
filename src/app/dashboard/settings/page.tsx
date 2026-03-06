'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, User, Shield, Bell, ShieldCheck, Home, AlertTriangle,
  LogOut, AlertCircle, Eye, EyeOff, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

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

// ─── Section Card wrapper ────────────────────────────────────────────────────

function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-navy-50 flex items-center justify-center">
          <Icon className="h-5 w-5 text-navy-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

// ─── Toggle row ──────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  comingSoon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 py-3 cursor-pointer group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          {comingSoon && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Coming soon</span>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled || comingSoon}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-navy-500/40 focus:ring-offset-2 ${
          checked ? 'bg-accent-600' : 'bg-gray-200'
        } ${(disabled || comingSoon) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </button>
    </label>
  );
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
    return (
      <div className="py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="h-8 bg-gray-200 rounded w-32 animate-pulse mb-2" />
            <div className="h-5 bg-gray-100 rounded w-72 animate-pulse" />
          </div>
          <div className="space-y-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card animate-pulse h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (!profile || !settings) {
    return (
      <div className="py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Unable to load settings</p>
              <p className="text-sm mt-1">{error || 'An unexpected error occurred'}</p>
              <button onClick={() => window.location.reload()} className="text-sm font-medium underline mt-2">
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
            <Check className="h-4 w-4" />
            {toast}
          </div>
        )}

        {/* Inline error */}
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-500 text-sm mt-1">
              Manage your account, notifications, security, and family preferences.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* ── Section 1: Account ──────────────────────────────────────── */}
          <SectionCard id="account" icon={User} title="Account" description="Your personal information">
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="input-field bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400 mt-1">Email changes require identity verification. Contact support.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="input-field"
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving === 'profile'}
                  className="btn-primary text-sm"
                >
                  {saving === 'profile' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </SectionCard>

          {/* ── Section 2: Security ────────────────────────────────────── */}
          <SectionCard id="security" icon={Shield} title="Security" description="Password and account security">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    required
                    className="input-field pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${newPassword.length >= 8 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    8+ characters
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${/[A-Z]/.test(newPassword) ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    Uppercase
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${/[a-z]/.test(newPassword) ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    Lowercase
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${/[0-9]/.test(newPassword) ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    Number
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                  className="input-field"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                )}
              </div>
              {passwordError && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {passwordError}
                </p>
              )}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving === 'password' || !newPassword || !confirmPassword}
                  className="btn-primary text-sm"
                >
                  {saving === 'password' ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>

            <div className="border-t border-[#E2E8F0] mt-6 pt-4">
              <p className="text-xs text-gray-400">
                Account created {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </SectionCard>

          {/* ── Section 3: Notifications ───────────────────────────────── */}
          <SectionCard id="notifications" icon={Bell} title="Notifications" description="Control how and when we reach you">
            <div className="divide-y divide-[#E2E8F0]">
              <ToggleRow
                label="Email notifications"
                description="Receive updates and confirmations via email"
                checked={settings.email_notifications}
                onChange={val => handleToggleNotification('email_notifications', val)}
                disabled={saving === 'notifications'}
              />
              <ToggleRow
                label="SMS notifications"
                description="Get text message alerts for time-sensitive updates"
                checked={settings.sms_notifications}
                onChange={val => handleToggleNotification('sms_notifications', val)}
                disabled={saving === 'notifications'}
                comingSoon
              />
              <ToggleRow
                label="Reservation reminders"
                description="Reminders before upcoming overnight stays"
                checked={settings.reservation_reminders}
                onChange={val => handleToggleNotification('reservation_reminders', val)}
                disabled={saving === 'notifications'}
              />
              <ToggleRow
                label="Billing reminders"
                description="Notifications about upcoming charges and invoices"
                checked={settings.billing_reminders}
                onChange={val => handleToggleNotification('billing_reminders', val)}
                disabled={saving === 'notifications'}
              />
              <ToggleRow
                label="Emergency alerts"
                description="Critical notifications about your child's safety (always recommended)"
                checked={settings.emergency_alerts}
                onChange={val => handleToggleNotification('emergency_alerts', val)}
                disabled={saving === 'notifications'}
              />
            </div>
          </SectionCard>

          {/* ── Section 4: Pickup & Safety ─────────────────────────────── */}
          <SectionCard id="safety" icon={ShieldCheck} title="Pickup & Safety" description="Security settings for child pickup verification">
            <div className="divide-y divide-[#E2E8F0]">
              <ToggleRow
                label="Require PIN for pickup verification"
                description="Authorized pickups must provide a PIN to verify identity"
                checked={settings.require_pickup_pin}
                onChange={val => handleToggleSafety('require_pickup_pin', val)}
                disabled={saving === 'safety'}
              />
              <ToggleRow
                label="Notify on check-in / check-out"
                description="Get notified when your child is checked in or picked up"
                checked={settings.notify_on_check_in_out}
                onChange={val => handleToggleSafety('notify_on_check_in_out', val)}
                disabled={saving === 'safety'}
              />
              <ToggleRow
                label="Notify on pickup list changes"
                description="Alert when an authorized pickup person is added or removed"
                checked={settings.notify_on_pickup_changes}
                onChange={val => handleToggleSafety('notify_on_pickup_changes', val)}
                disabled={saving === 'safety'}
              />
              <ToggleRow
                label="Emergency contact reminder"
                description="Remind you if emergency contact info is incomplete"
                checked={settings.emergency_contact_reminder}
                onChange={val => handleToggleSafety('emergency_contact_reminder', val)}
                disabled={saving === 'safety'}
              />
            </div>
          </SectionCard>

          {/* ── Section 5: Household / Preferences ─────────────────────── */}
          <SectionCard id="preferences" icon={Home} title="Household Preferences" description="Communication and care preferences">
            <form onSubmit={handleSavePreferences} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preferred contact method</label>
                <select
                  value={preferredContact}
                  onChange={e => setPreferredContact(e.target.value)}
                  className="input-field"
                >
                  <option value="">No preference</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone call</option>
                  <option value="text">Text message</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reminder timing</label>
                <select
                  value={reminderTiming}
                  onChange={e => setReminderTiming(e.target.value)}
                  className="input-field"
                >
                  <option value="">Default</option>
                  <option value="1h">1 hour before</option>
                  <option value="3h">3 hours before</option>
                  <option value="1d">1 day before</option>
                  <option value="2d">2 days before</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes for staff</label>
                <textarea
                  value={staffNotes}
                  onChange={e => setStaffNotes(e.target.value)}
                  placeholder="Any special instructions or preferences for our staff..."
                  rows={3}
                  maxLength={1000}
                  className="input-field resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{staffNotes.length}/1000 characters</p>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving === 'preferences'}
                  className="btn-primary text-sm"
                >
                  {saving === 'preferences' ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </form>
          </SectionCard>

          {/* ── Section 6: Danger Zone ─────────────────────────────────── */}
          <section className="card border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Danger Zone</h2>
                <p className="text-sm text-gray-500">Irreversible account actions</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Logout */}
              <div className="flex items-center justify-between py-3 border-b border-[#E2E8F0]">
                <div>
                  <p className="text-sm font-medium text-gray-900">Log out</p>
                  <p className="text-xs text-gray-500">Sign out of your current session</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </button>
              </div>

              {/* Delete account */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-red-700">Request account deletion</p>
                  <p className="text-xs text-gray-500">
                    Submit a request to permanently delete your account and all associated data.
                    This will be processed within 5 business days.
                  </p>
                </div>
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-danger text-sm flex-shrink-0"
                  >
                    Request Deletion
                  </button>
                ) : (
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200 w-full sm:w-auto sm:min-w-[300px]">
                    <p className="text-sm text-red-700 font-medium mb-2">
                      Type &quot;DELETE&quot; to confirm
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={e => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="input-field text-sm mb-3"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteAccountRequest}
                        disabled={deleteConfirmText !== 'DELETE' || saving === 'delete_account_request'}
                        className="btn-danger text-sm flex-1"
                      >
                        {saving === 'delete_account_request' ? 'Submitting...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                        className="btn-secondary text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
