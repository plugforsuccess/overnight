'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Moon, Check, Shield, Heart, Building2, Users, ChevronRight, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import type { ChildRow, ChildEmergencyContactRow, ChildAuthorizedPickupRow } from '@/types/children';

import { ChildFormBasics } from '@/components/children/ChildFormBasics';
import { EmergencyContactsEditor } from '@/components/children/EmergencyContactsEditor';

// Simplified onboarding: Account → Child → Emergency Contact → Done
// Authorized pickups and additional profile details are handled in the dashboard.
// This reduces friction and keeps signup completion high (~3 steps after account).
type Step = 'account' | 'child' | 'emergency' | 'done';
const STEPS: Step[] = ['account', 'child', 'emergency', 'done'];
const STEP_LABELS = ['Account', 'Child', 'Emergency', 'Done'];

interface FieldErrors {
  [key: string]: string;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-400' };
  if (score <= 2) return { score, label: 'Fair', color: 'bg-yellow-400' };
  if (score <= 3) return { score, label: 'Good', color: 'bg-blue-400' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Omit the hash from the pickup type for display
type PickupDisplay = Omit<ChildAuthorizedPickupRow, 'pickup_pin_hash'>;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Created child record (from step 2)
  const [createdChild, setCreatedChild] = useState<ChildRow | null>(null);

  // Emergency contacts and auto-created pickups (from step 3)
  const [emergencyContacts, setEmergencyContacts] = useState<ChildEmergencyContactRow[]>([]);
  const [autoCreatedPickups, setAutoCreatedPickups] = useState<PickupDisplay[]>([]);
  const [saving, setSaving] = useState(false);

  // Step 1 — Parent Account
  const [account, setAccount] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  const stepIndex = STEPS.indexOf(step);

  const setFieldError = useCallback((field: string, message: string) => {
    setFieldErrors(prev => ({ ...prev, [field]: message }));
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  // ── Auth token helper ──────────────────────────────────────────────
  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  // ── Inline validators ──────────────────────────────────────────────

  function validateAccountField(field: string, value: string) {
    clearFieldError(field);
    switch (field) {
      case 'email':
        if (value && !validateEmail(value.trim())) setFieldError('email', 'Please enter a valid email address');
        break;
      case 'phone':
        if (value && !validatePhone(value)) setFieldError('phone', 'Please enter a valid 10-digit phone number');
        break;
      case 'password':
        if (value && value.length < 8) setFieldError('password', 'Password must be at least 8 characters');
        if (account.confirmPassword && value !== account.confirmPassword)
          setFieldError('confirmPassword', 'Passwords do not match');
        else clearFieldError('confirmPassword');
        break;
      case 'confirmPassword':
        if (value && value !== account.password) setFieldError('confirmPassword', 'Passwords do not match');
        break;
    }
  }

  function validateAccountStep(): boolean {
    const errors: FieldErrors = {};
    if (!account.firstName.trim()) errors.firstName = 'First name is required';
    if (!account.lastName.trim()) errors.lastName = 'Last name is required';
    if (!account.email.trim()) errors.email = 'Email is required';
    else if (!validateEmail(account.email.trim())) errors.email = 'Please enter a valid email address';
    if (!account.phone.trim()) errors.phone = 'Phone number is required';
    else if (!validatePhone(account.phone)) errors.phone = 'Please enter a valid 10-digit phone number';
    if (!account.address.trim()) errors.address = 'Address or ZIP code is required';
    if (!account.password) errors.password = 'Password is required';
    else if (account.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (account.password !== account.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Step navigation ────────────────────────────────────────────────

  async function handleAccountNext() {
    if (!validateAccountStep()) return;
    setError('');
    setLoading(true);

    try {
      if (!userId) {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: account.email.trim(),
            password: account.password,
            fullName: `${account.firstName.trim()} ${account.lastName.trim()}`,
            firstName: account.firstName.trim(),
            lastName: account.lastName.trim(),
            phone: account.phone.replace(/\D/g, ''),
            address: account.address,
          }),
        });
        const result = await res.json();

        if (!res.ok) {
          const msg = (result.error || '').toLowerCase();
          if (msg.includes('rate limit')) {
            setError('Too many sign up attempts. Please wait a few minutes and try again.');
          } else if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
            setError('This email is already registered. Please sign in instead.');
          } else {
            setError(result.error || 'Signup failed. Please try again.');
          }
          setLoading(false);
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: account.email.trim(),
          password: account.password,
        });
        if (signInError) {
          setError(`Account created but could not sign in: ${signInError.message}`);
          setLoading(false);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Account created but session could not be established. Please try logging in.');
          setLoading(false);
          return;
        }
        setUserId(user.id);
      }

      setLoading(false);
      setStep('child');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // ── Child form save (uses shared ChildFormBasics component) ────────

  async function handleSaveChild(data: { first_name: string; last_name: string; date_of_birth: string; medical_notes: string }) {
    if (!userId) {
      setError('Account not found. Please go back and try again.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/children', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create child profile');
      setCreatedChild(result.child);
      setSaving(false);
      setStep('emergency');
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  // ── Emergency contact handlers (reuse same API as dashboard) ──────
  // When authorized_for_pickup is toggled with a PIN, the API auto-creates
  // an authorized pickup record — no separate pickup step needed.

  async function handleAddContact(contact: any) {
    if (!createdChild) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/children/${createdChild.id}/emergency-contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(contact),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add contact');
    setEmergencyContacts(prev => [...prev, data.contact]);
    // Track auto-created pickups from the emergency contact promotion
    if (data.pickup) {
      setAutoCreatedPickups(prev => [...prev, data.pickup]);
    }
  }

  async function handleUpdateContact(id: string, contact: any) {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/emergency-contacts/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(contact),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update contact');
    setEmergencyContacts(prev => prev.map(c => c.id === id ? data.contact : c));
  }

  async function handleDeleteContact(id: string) {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/emergency-contacts/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete contact');
    }
    setEmergencyContacts(prev => prev.filter(c => c.id !== id));
  }

  function handleBack() {
    setError('');
    setFieldErrors({});
    if (step === 'child') setStep('account');
    if (step === 'emergency') setStep('child');
  }

  // ── Derived values ──────────────────────────────────────────────────

  const passwordStrength = account.password ? getPasswordStrength(account.password) : null;

  const stepTitles: Record<Step, string> = {
    account: 'Create Your Account',
    child: 'Add Your Child',
    emergency: 'Emergency Contact',
    done: '',
  };

  const stepDescriptions: Record<Step, string> = {
    account: 'Join DreamWatch Overnight',
    child: 'Tell us about your little one',
    emergency: 'Who should we call in an emergency?',
    done: '',
  };

  // ── Main render ────────────────────────────────────────────────────

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-8 px-4">
      <div className="w-full max-w-md">
        {/* Header — only on form steps */}
        {step !== 'done' && (
          <div className="text-center mb-6">
            <Moon className="h-10 w-10 text-accent-500 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-gray-900">{stepTitles[step]}</h1>
            <p className="text-gray-500 mt-1 text-sm">{stepDescriptions[step]}</p>
          </div>
        )}

        {/* Progress bar */}
        <nav aria-label="Signup progress" className="mb-8">
          <ol className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const isCurrent = i === stepIndex;
              const isComplete = i < stepIndex;
              return (
                <li key={s} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                        isComplete
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-navy-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {isComplete ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    <span
                      className={`mt-1.5 text-xs font-medium ${
                        isCurrent ? 'text-navy-700' : isComplete ? 'text-green-600' : 'text-gray-400'
                      }`}
                    >
                      {STEP_LABELS[i]}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-2 mt-[-1rem] ${
                        i < stepIndex ? 'bg-green-400' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Trust signals — step 1 only */}
        {step === 'account' && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>Licensed caregivers</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Heart className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>CPR-certified staff</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>Secure facility</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span>Trusted by ATL healthcare workers</span>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="onboarding-card">
          {/* Global error */}
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm mb-5" role="alert">
              {error}
            </div>
          )}

          {/* Step 1: Account */}
          {step === 'account' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="onboarding-label">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={account.firstName}
                    onChange={e => {
                      setAccount(prev => ({ ...prev, firstName: e.target.value }));
                      clearFieldError('firstName');
                    }}
                    className="onboarding-input"
                    placeholder="First name"
                    autoComplete="given-name"
                    required
                    aria-invalid={!!fieldErrors.firstName}
                  />
                  {fieldErrors.firstName && (
                    <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.firstName}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="lastName" className="onboarding-label">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={account.lastName}
                    onChange={e => {
                      setAccount(prev => ({ ...prev, lastName: e.target.value }));
                      clearFieldError('lastName');
                    }}
                    className="onboarding-input"
                    placeholder="Last name"
                    autoComplete="family-name"
                    required
                    aria-invalid={!!fieldErrors.lastName}
                  />
                  {fieldErrors.lastName && (
                    <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.lastName}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="email" className="onboarding-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={account.email}
                  onChange={e => {
                    setAccount(prev => ({ ...prev, email: e.target.value }));
                    validateAccountField('email', e.target.value);
                  }}
                  className="onboarding-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className="onboarding-label">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={account.phone}
                  onChange={e => {
                    const formatted = formatPhoneInput(e.target.value);
                    setAccount(prev => ({ ...prev, phone: formatted }));
                    validateAccountField('phone', formatted);
                  }}
                  className="onboarding-input"
                  placeholder="(404) 555-0123"
                  autoComplete="tel"
                  required
                  aria-invalid={!!fieldErrors.phone}
                />
                {fieldErrors.phone && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label htmlFor="address" className="onboarding-label">
                  Address or ZIP Code
                </label>
                <input
                  id="address"
                  type="text"
                  value={account.address}
                  onChange={e => {
                    setAccount(prev => ({ ...prev, address: e.target.value }));
                    clearFieldError('address');
                  }}
                  className="onboarding-input"
                  placeholder="123 Main St, Atlanta, GA or 30301"
                  autoComplete="street-address"
                  required
                  aria-invalid={!!fieldErrors.address}
                />
                {fieldErrors.address && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.address}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="onboarding-label">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={account.password}
                    onChange={e => {
                      setAccount(prev => ({ ...prev, password: e.target.value }));
                      validateAccountField('password', e.target.value);
                    }}
                    className="onboarding-input pr-10"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                    aria-invalid={!!fieldErrors.password}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.password}</p>
                )}
                {passwordStrength && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs mt-1 ${
                      passwordStrength.score <= 1 ? 'text-red-500' : passwordStrength.score <= 2 ? 'text-yellow-600' : passwordStrength.score <= 3 ? 'text-blue-600' : 'text-green-600'
                    }`}>
                      {passwordStrength.label}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="onboarding-label">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    value={account.confirmPassword}
                    onChange={e => {
                      setAccount(prev => ({ ...prev, confirmPassword: e.target.value }));
                      validateAccountField('confirmPassword', e.target.value);
                    }}
                    className="onboarding-input pr-10"
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    aria-invalid={!!fieldErrors.confirmPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-gray-400 hover:text-gray-600"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.confirmPassword}</p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Child Profile — uses shared ChildFormBasics component */}
          {step === 'child' && (
            <div>
              {createdChild ? (
                <div className="space-y-4">
                  <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
                    <Check className="w-4 h-4 inline mr-1" />
                    {createdChild.first_name} {createdChild.last_name}&apos;s profile has been created.
                  </div>
                  <p className="text-sm text-gray-600">
                    You can edit this profile later in the dashboard. Click Continue to add an emergency contact.
                  </p>
                </div>
              ) : (
                <ChildFormBasics
                  child={null}
                  onSave={handleSaveChild}
                  saving={saving}
                />
              )}
            </div>
          )}

          {/* Step 3: Emergency Contact — uses shared EmergencyContactsEditor */}
          {/* When "authorized for pickup" is toggled, inline PIN fields appear */}
          {/* and the API auto-creates an authorized pickup record */}
          {step === 'emergency' && createdChild && (
            <div>
              <EmergencyContactsEditor
                childId={createdChild.id}
                contacts={emergencyContacts}
                onAdd={handleAddContact}
                onUpdate={handleUpdateContact}
                onDelete={handleDeleteContact}
                saving={saving}
              />
              {emergencyContacts.length === 0 && (
                <p className="text-sm text-yellow-700 bg-yellow-50 px-4 py-3 rounded-lg mt-4">
                  At least 1 emergency contact is required before you can book overnight care.
                </p>
              )}
              {autoCreatedPickups.length > 0 && (
                <p className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-lg mt-4">
                  <Check className="w-4 h-4 inline mr-1" />
                  {autoCreatedPickups.length} authorized pickup{autoCreatedPickups.length > 1 ? 's' : ''} created from emergency contacts.
                </p>
              )}
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Your account is ready</h2>
              <p className="text-gray-600 mb-4">You can now schedule overnight care for your child.</p>

              {/* Summary */}
              {createdChild && (
                <div className="bg-gray-50 rounded-lg p-4 text-left mb-6 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Child</span>
                    <span className="font-medium">{createdChild.first_name} {createdChild.last_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Emergency Contacts</span>
                    <span className="font-medium">{emergencyContacts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Authorized Pickups</span>
                    <span className="font-medium">{autoCreatedPickups.length}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 mb-6">
                You can add more children, emergency contacts, and authorized pickups from the dashboard.
              </p>

              <button
                onClick={() => router.push('/schedule')}
                className="btn-primary w-full text-base py-3"
              >
                Continue to Booking
                <ChevronRight className="w-5 h-5 inline ml-1" />
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="btn-secondary w-full mt-3 text-base py-3"
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {/* Navigation buttons */}
          {step !== 'done' && (
            <div className="flex gap-3 mt-6">
              {step !== 'account' && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="btn-secondary flex-none px-4 py-3"
                  disabled={loading || saving}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {step === 'account' && (
                <button
                  type="button"
                  onClick={handleAccountNext}
                  className="btn-primary flex-1 py-3 text-base font-semibold"
                  disabled={loading}
                >
                  {loading ? 'Please wait...' : 'Continue'}
                </button>
              )}
              {step === 'child' && createdChild && (
                <button
                  type="button"
                  onClick={() => setStep('emergency')}
                  className="btn-primary flex-1 py-3 text-base font-semibold"
                >
                  Continue
                </button>
              )}
              {step === 'emergency' && (
                <button
                  type="button"
                  onClick={() => setStep('done')}
                  className="btn-primary flex-1 py-3 text-base font-semibold"
                  disabled={emergencyContacts.length === 0}
                >
                  {emergencyContacts.length === 0 ? 'Add a Contact First' : 'Complete Signup'}
                </button>
              )}
            </div>
          )}

          {/* Sign-in link — step 1 only */}
          {step === 'account' && (
            <div className="mt-5 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/login" className="text-accent-600 hover:text-accent-700 font-medium">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
