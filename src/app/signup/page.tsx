'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Moon, Check, Shield, Heart, Building2, Users, ChevronRight, ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';

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

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1 — Parent Account
  const [account, setAccount] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  // Step 2 — Child Profile
  const [child, setChild] = useState({
    fullName: '',
    dateOfBirth: '',
    hasAllergies: false,
    allergyNotes: '',
  });

  // Step 3 — Emergency Contact
  const [emergency, setEmergency] = useState({
    contactName: '',
    relationship: '',
    phone: '',
    pickupPerson: '',
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

  function validateStep(): boolean {
    const errors: FieldErrors = {};

    if (step === 'account') {
      if (!account.fullName.trim()) errors.fullName = 'Full name is required';
      if (!account.email.trim()) errors.email = 'Email is required';
      else if (!validateEmail(account.email.trim())) errors.email = 'Please enter a valid email address';
      if (!account.phone.trim()) errors.phone = 'Phone number is required';
      else if (!validatePhone(account.phone)) errors.phone = 'Please enter a valid 10-digit phone number';
      if (!account.address.trim()) errors.address = 'Address or ZIP code is required';
      if (!account.password) errors.password = 'Password is required';
      else if (account.password.length < 8) errors.password = 'Password must be at least 8 characters';
      if (account.password !== account.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    }

    if (step === 'child') {
      if (!child.fullName.trim()) errors.childName = 'Child name is required';
      if (!child.dateOfBirth) errors.childDob = 'Date of birth is required';
      if (child.hasAllergies && !child.allergyNotes.trim()) errors.allergyNotes = 'Please describe the allergies or conditions';
    }

    if (step === 'emergency') {
      if (!emergency.contactName.trim()) errors.emergencyName = 'Emergency contact name is required';
      if (!emergency.relationship.trim()) errors.emergencyRelationship = 'Relationship is required';
      if (!emergency.phone.trim()) errors.emergencyPhone = 'Phone number is required';
      else if (!validatePhone(emergency.phone)) errors.emergencyPhone = 'Please enter a valid phone number';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Step navigation ────────────────────────────────────────────────

  async function handleNext() {
    if (!validateStep()) return;
    setError('');

    if (step === 'account') {
      setLoading(true);
      try {
        // Skip signUp if user already created (e.g. navigated back to this step)
        if (!userId) {
          // Use admin API to create user with email auto-confirmed
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: account.email.trim(),
              password: account.password,
              fullName: account.fullName,
              phone: account.phone.replace(/\D/g, ''),
              address: account.address,
            }),
          });
          const result = await res.json();

          if (!res.ok) {
            const msg = (result.error || '').toLowerCase();
            if (msg.includes('rate limit')) {
              setError('Too many attempts. Please wait 5 minutes before trying again.');
            } else if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('already exists')) {
              setError('This email is already registered. Please sign in instead.');
            } else {
              setError(result.error || 'Signup failed. Please try again.');
            }
            setLoading(false);
            return;
          }

          // Sign in to establish a session
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: account.email.trim(),
            password: account.password,
          });
          if (signInError) {
            setError('Account created but could not sign in. Please try logging in.');
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
      return;
    }

    if (step === 'child') {
      if (!userId) {
        setError('Account not found. Please go back and try again.');
        return;
      }
      setStep('emergency');
      return;
    }

    if (step === 'emergency') {
      if (!userId) {
        setError('Account not found. Please go back and try again.');
        return;
      }
      setLoading(true);
      try {
        const { error: childError } = await supabase
          .from('children')
          .insert({
            parent_id: userId,
            full_name: child.fullName,
            date_of_birth: child.dateOfBirth,
            allergies: child.hasAllergies ? child.allergyNotes : null,
            medical_notes: null,
            emergency_contact_name: emergency.contactName,
            emergency_contact_phone: emergency.phone.replace(/\D/g, ''),
            authorized_pickup: emergency.pickupPerson || '',
          });

        if (childError) {
          setError(childError.message);
          setLoading(false);
          return;
        }

        setLoading(false);
        setStep('done');
      } catch {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
      return;
    }
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
              <div>
                <label htmlFor="fullName" className="onboarding-label">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={account.fullName}
                  onChange={e => {
                    setAccount(prev => ({ ...prev, fullName: e.target.value }));
                    clearFieldError('fullName');
                  }}
                  className="onboarding-input"
                  placeholder="Your full name"
                  autoComplete="name"
                  required
                  aria-invalid={!!fieldErrors.fullName}
                />
                {fieldErrors.fullName && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.fullName}</p>
                )}
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

          {/* Step 2: Child Profile */}
          {step === 'child' && (
            <div className="space-y-5">
              <div>
                <label htmlFor="childName" className="onboarding-label">
                  Child&apos;s Name
                </label>
                <input
                  id="childName"
                  type="text"
                  value={child.fullName}
                  onChange={e => {
                    setChild(prev => ({ ...prev, fullName: e.target.value }));
                    clearFieldError('childName');
                  }}
                  className="onboarding-input"
                  placeholder="Your child's full name"
                  required
                  aria-invalid={!!fieldErrors.childName}
                />
                {fieldErrors.childName && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.childName}</p>
                )}
              </div>

              <div>
                <label htmlFor="childDob" className="onboarding-label">
                  Date of Birth
                </label>
                <input
                  id="childDob"
                  type="date"
                  value={child.dateOfBirth}
                  onChange={e => {
                    setChild(prev => ({ ...prev, dateOfBirth: e.target.value }));
                    clearFieldError('childDob');
                  }}
                  className="onboarding-input"
                  required
                  aria-invalid={!!fieldErrors.childDob}
                />
                {fieldErrors.childDob && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.childDob}</p>
                )}
              </div>

              <fieldset className="space-y-3">
                <legend className="onboarding-label">
                  Does your child have allergies or medical conditions?
                </legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hasAllergies"
                      checked={!child.hasAllergies}
                      onChange={() => setChild(prev => ({ ...prev, hasAllergies: false, allergyNotes: '' }))}
                      className="w-4 h-4 text-accent-600 focus:ring-accent-500"
                    />
                    <span className="text-sm text-gray-700">No</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="hasAllergies"
                      checked={child.hasAllergies}
                      onChange={() => setChild(prev => ({ ...prev, hasAllergies: true }))}
                      className="w-4 h-4 text-accent-600 focus:ring-accent-500"
                    />
                    <span className="text-sm text-gray-700">Yes</span>
                  </label>
                </div>
                {child.hasAllergies && (
                  <div>
                    <label htmlFor="allergyNotes" className="onboarding-label">
                      Describe allergies or medical conditions
                    </label>
                    <textarea
                      id="allergyNotes"
                      value={child.allergyNotes}
                      onChange={e => {
                        setChild(prev => ({ ...prev, allergyNotes: e.target.value }));
                        clearFieldError('allergyNotes');
                      }}
                      className="onboarding-input min-h-[80px] resize-none"
                      placeholder="e.g., Peanut allergy, asthma inhaler needed"
                      aria-invalid={!!fieldErrors.allergyNotes}
                    />
                    {fieldErrors.allergyNotes && (
                      <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.allergyNotes}</p>
                    )}
                  </div>
                )}
              </fieldset>
            </div>
          )}

          {/* Step 3: Emergency Contact */}
          {step === 'emergency' && (
            <div className="space-y-5">
              <div>
                <label htmlFor="emergencyName" className="onboarding-label">
                  Emergency Contact Name
                </label>
                <input
                  id="emergencyName"
                  type="text"
                  value={emergency.contactName}
                  onChange={e => {
                    setEmergency(prev => ({ ...prev, contactName: e.target.value }));
                    clearFieldError('emergencyName');
                  }}
                  className="onboarding-input"
                  placeholder="Full name"
                  required
                  aria-invalid={!!fieldErrors.emergencyName}
                />
                {fieldErrors.emergencyName && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.emergencyName}</p>
                )}
              </div>

              <div>
                <label htmlFor="emergencyRelationship" className="onboarding-label">
                  Relationship
                </label>
                <select
                  id="emergencyRelationship"
                  value={emergency.relationship}
                  onChange={e => {
                    setEmergency(prev => ({ ...prev, relationship: e.target.value }));
                    clearFieldError('emergencyRelationship');
                  }}
                  className="onboarding-input"
                  required
                  aria-invalid={!!fieldErrors.emergencyRelationship}
                >
                  <option value="">Select relationship</option>
                  <option value="Grandmother">Grandmother</option>
                  <option value="Grandfather">Grandfather</option>
                  <option value="Aunt">Aunt</option>
                  <option value="Uncle">Uncle</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Partner">Partner</option>
                  <option value="Friend">Friend</option>
                  <option value="Other">Other</option>
                </select>
                {fieldErrors.emergencyRelationship && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.emergencyRelationship}</p>
                )}
              </div>

              <div>
                <label htmlFor="emergencyPhone" className="onboarding-label">
                  Phone Number
                </label>
                <input
                  id="emergencyPhone"
                  type="tel"
                  value={emergency.phone}
                  onChange={e => {
                    const formatted = formatPhoneInput(e.target.value);
                    setEmergency(prev => ({ ...prev, phone: formatted }));
                    if (formatted && !validatePhone(formatted)) {
                      setFieldError('emergencyPhone', 'Please enter a valid phone number');
                    } else {
                      clearFieldError('emergencyPhone');
                    }
                  }}
                  className="onboarding-input"
                  placeholder="(404) 555-0123"
                  autoComplete="tel"
                  required
                  aria-invalid={!!fieldErrors.emergencyPhone}
                />
                {fieldErrors.emergencyPhone && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{fieldErrors.emergencyPhone}</p>
                )}
              </div>

              <div>
                <label htmlFor="pickupPerson" className="onboarding-label">
                  Authorized Pickup Person <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="pickupPerson"
                  type="text"
                  value={emergency.pickupPerson}
                  onChange={e => setEmergency(prev => ({ ...prev, pickupPerson: e.target.value }))}
                  className="onboarding-input"
                  placeholder="Name of additional authorized pickup"
                />
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Your account is ready</h2>
              <p className="text-gray-600 mb-8">You can now schedule overnight care for your child.</p>
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
                  disabled={loading}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="btn-primary flex-1 py-3 text-base font-semibold"
                disabled={loading}
              >
                {loading
                  ? 'Please wait...'
                  : step === 'emergency'
                  ? 'Complete Signup'
                  : 'Continue'}
              </button>
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
