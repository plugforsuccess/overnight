'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, AlertCircle, Check, ArrowLeft, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_PRICING_TIERS, DEFAULT_OPERATING_NIGHTS, formatCents, DEFAULT_CAPACITY, BOOKING_WINDOW_DAYS } from '@/lib/constants';
import { getWeekNights, cn, getUpcomingWeeks } from '@/lib/utils';
import { DayOfWeek, Child, AdminSettings, PricingTier } from '@/types/database';
import CalendarSelector from '@/components/schedule/CalendarSelector';
import SelectedNightsBar from '@/components/schedule/SelectedNightsBar';
import { ReservationConfirmationCard } from '@/components/schedule/ReservationConfirmationCard';
import { ChildSafetyCard, ChildSafetyInfo } from '@/components/ui/ChildSafetyCard';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { PickupContact } from '@/components/ui/AuthorizedPickupsPanel';
import { format, parseISO, startOfWeek, isSameWeek } from 'date-fns';

interface ChildProfile extends Child {
  emergency_contacts_count: number;
  authorized_pickups_count: number;
  has_medical_profile?: boolean;
  has_medical_notes?: boolean;
  allergies_data?: { id: string; display_name: string; severity: string }[];
  pickups_data?: PickupContact[];
}

function autoCalculatePlan(nightCount: number, pricingTiers: PricingTier[]): PricingTier | null {
  return pricingTiers.find(t => t.nights === nightCount) ?? null;
}

function childToSafetyInfo(child: ChildProfile): ChildSafetyInfo {
  return {
    id: child.id,
    first_name: child.first_name,
    last_name: child.last_name,
    date_of_birth: child.date_of_birth,
    allergies: child.allergies_data || [],
    emergency_contacts_count: child.emergency_contacts_count,
    authorized_pickups_count: child.authorized_pickups_count,
    has_medical_profile: child.has_medical_profile || false,
    has_medical_notes: child.has_medical_notes || false,
  };
}

export default function SchedulePage() {
  const router = useRouter();
  const [step, setStep] = useState<'calendar' | 'child' | 'confirm'>('calendar');
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [selectedNights, setSelectedNights] = useState<Set<string>>(new Set());
  const [nightCapacity, setNightCapacity] = useState<Record<string, number>>({});
  const [caregiverNotes, setCaregiverNotes] = useState<string>('');
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const pricingTiers = settings?.pricing_tiers ?? DEFAULT_PRICING_TIERS;
  const operatingNights = (settings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];
  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;

  const matchedPlan = autoCalculatePlan(selectedNights.size, pricingTiers);

  const sortedNights = Array.from(selectedNights).sort();
  const weekStartDate = sortedNights.length > 0
    ? startOfWeek(parseISO(sortedNights[0]), { weekStartsOn: 0 })
    : null;

  const loadCapacity = useCallback(async (opNights: DayOfWeek[]) => {
    const weeks = getUpcomingWeeks(5, BOOKING_WINDOW_DAYS);
    const allDates: string[] = [];
    for (const week of weeks) {
      const nights = getWeekNights(week, opNights);
      allDates.push(...nights.map(n => n.dateStr));
    }

    if (allDates.length === 0) return;

    const { data: reservations } = await supabase
      .from('reservations')
      .select('date')
      .in('date', allDates)
      .eq('status', 'confirmed');

    const counts: Record<string, number> = {};
    allDates.forEach(d => counts[d] = 0);
    reservations?.forEach((r: { date: string }) => {
      counts[r.date] = (counts[r.date] || 0) + 1;
    });
    setNightCapacity(counts);
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: parentRow } = await supabase
        .from('parents')
        .select('id')
        .eq('id', user.id)
        .single();

      const parentId = parentRow?.id ?? user.id;
      setUserId(parentId);

      const [childrenRes, settingsRes] = await Promise.all([
        supabase
          .from('children')
          .select(`
            *,
            child_emergency_contacts(id),
            child_authorized_pickups(id, first_name, last_name, relationship, phone, is_emergency_contact, id_verified),
            child_medical_profiles(id),
            child_allergies(id, allergen, custom_label, severity)
          `)
          .eq('parent_id', parentId),
        supabase.from('admin_settings').select('*').limit(1).single(),
      ]);

      if (childrenRes.data) {
        const enriched: ChildProfile[] = childrenRes.data.map((c: Record<string, unknown>) => ({
          ...c,
          emergency_contacts_count: Array.isArray(c.child_emergency_contacts) ? c.child_emergency_contacts.length : 0,
          authorized_pickups_count: Array.isArray(c.child_authorized_pickups) ? c.child_authorized_pickups.length : 0,
          has_medical_profile: Array.isArray(c.child_medical_profiles) && c.child_medical_profiles.length > 0,
          has_medical_notes: !!(c as any).medical_notes,
          allergies_data: Array.isArray(c.child_allergies)
            ? (c.child_allergies as any[]).map((a: any) => ({
                id: a.id,
                display_name: a.allergen === 'OTHER' ? (a.custom_label || 'Other') : formatAllergen(a.allergen),
                severity: a.severity,
              }))
            : [],
          pickups_data: Array.isArray(c.child_authorized_pickups)
            ? (c.child_authorized_pickups as any[]).map((p: any) => ({
                id: p.id,
                first_name: p.first_name,
                last_name: p.last_name,
                relationship: p.relationship,
                phone: p.phone,
                is_emergency_contact: p.is_emergency_contact,
                id_verified: p.id_verified,
              }))
            : [],
        })) as ChildProfile[];
        setChildren(enriched);
      }

      const resolvedSettings = settingsRes.data as AdminSettings | null;
      if (resolvedSettings) setSettings(resolvedSettings);

      const opNights = (resolvedSettings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];
      await loadCapacity(opNights);

      setLoading(false);
    }
    load();
  }, [router, loadCapacity]);

  function toggleNight(dateStr: string) {
    const updated = new Set(selectedNights);
    if (updated.has(dateStr)) {
      updated.delete(dateStr);
    } else {
      updated.add(dateStr);
    }
    setSelectedNights(updated);
  }

  function removeNight(dateStr: string) {
    const updated = new Set(selectedNights);
    updated.delete(dateStr);
    setSelectedNights(updated);
  }

  function isChildProfileComplete(child: ChildProfile): boolean {
    return child.emergency_contacts_count >= 1 && child.authorized_pickups_count >= 1;
  }

  function getProfileIncompleteMessage(child: ChildProfile): string {
    const missing: string[] = [];
    if (child.emergency_contacts_count < 1) missing.push('at least 1 emergency contact');
    if (child.authorized_pickups_count < 1) missing.push('at least 1 authorized pickup');
    return `Complete ${child.first_name} ${child.last_name}'s profile before booking: add ${missing.join(' and ')}.`;
  }

  function handleSelectChild(childId: string) {
    setSelectedChild(childId);
    const child = children.find((c: ChildProfile) => c.id === childId);
    if (child && !isChildProfileComplete(child)) {
      setError(getProfileIncompleteMessage(child));
      setErrorCode('PROFILE_INCOMPLETE');
      return;
    }
    setError('');
    setErrorCode(null);
    setStep('confirm');
  }

  function handleContinueFromCalendar() {
    if (!matchedPlan) {
      setError(`No plan available for ${selectedNights.size} nights. Available plans: ${pricingTiers.map((t: PricingTier) => `${t.nights} nights`).join(', ')}.`);
      setErrorCode('INVALID_PLAN_SELECTION');
      return;
    }

    const sorted = Array.from(selectedNights).sort();
    const firstDate = parseISO(sorted[0]);
    const allSameWeek = sorted.every(d => isSameWeek(parseISO(d), firstDate, { weekStartsOn: 0 }));
    if (!allSameWeek) {
      setError('All selected nights must be within the same week. Please adjust your selection.');
      setErrorCode('INVALID_PLAN_SELECTION');
      return;
    }

    setError('');
    setErrorCode(null);
    setStep('child');
  }

  async function handleSubmit() {
    if (!userId) {
      setError('Session expired. Please log in again.');
      setErrorCode('AUTH_REQUIRED');
      router.push('/login');
      return;
    }
    if (!selectedChild || !matchedPlan || selectedNights.size === 0) {
      setError('Please complete all steps before confirming.');
      setErrorCode('INVALID_PLAN_SELECTION');
      return;
    }

    const childProfile = children.find((c: ChildProfile) => c.id === selectedChild);
    if (childProfile && !isChildProfileComplete(childProfile)) {
      setError(getProfileIncompleteMessage(childProfile));
      setErrorCode('PROFILE_INCOMPLETE');
      return;
    }

    setSubmitting(true);
    setError('');
    setErrorCode(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Session expired. Please log in again.');
        setErrorCode('AUTH_REQUIRED');
        router.push('/login');
        return;
      }
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      const weekStart = weekStartDate ? format(weekStartDate, 'yyyy-MM-dd') : sortedNights[0];

      const requestPayload = {
        childId: selectedChild,
        nightsPerWeek: matchedPlan.nights,
        selectedNights: sortedNights,
        weekStart,
        caregiverNotes: caregiverNotes || undefined,
      };

      console.log('[schedule] submitting booking:', JSON.stringify(requestPayload));

      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(requestPayload),
      });

      const bookingData = await bookingRes.json();
      console.log('[schedule] booking response:', bookingRes.status, JSON.stringify(bookingData));

      if (!bookingRes.ok) {
        const code = bookingData.code || 'UNKNOWN_ERROR';
        setErrorCode(code);

        if (code === 'PROFILE_INCOMPLETE') {
          setError(bookingData.error);
        } else if (code === 'CHILD_NOT_OWNED') {
          setError('This child does not belong to your account.');
        } else if (code === 'AUTH_REQUIRED') {
          setError('Session expired. Please log in again.');
          router.push('/login');
          return;
        } else {
          setError(bookingData.error || 'Failed to create booking');
        }
        setSubmitting(false);
        return;
      }

      console.log('[schedule] creating stripe checkout for plan:', bookingData.plan.id);

      const stripeRes = await fetch('/api/stripe', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ planId: bookingData.plan.id }),
      });

      const stripeData = await stripeRes.json();
      console.log('[schedule] stripe response:', stripeRes.status, JSON.stringify(stripeData));

      if (!stripeRes.ok) {
        const code = stripeData.code || 'STRIPE_SESSION_CREATE_FAILED';
        setErrorCode(code);
        setError(stripeData.error || 'Failed to initiate payment');
        setSubmitting(false);
        return;
      }

      if (stripeData.url) {
        window.location.href = stripeData.url;
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      console.error('[schedule] submit error:', err);
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      setErrorCode('UNKNOWN_ERROR');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const stepOrder = ['calendar', 'child', 'confirm'] as const;
  const stepIndex = stepOrder.indexOf(step);
  const stepLabels = ['Select Nights', 'Select Child', 'Confirm'];

  const selectedChildProfile = children.find((c: ChildProfile) => c.id === selectedChild);

  return (
    <div className="py-8 sm:py-12 pb-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <Moon className="h-10 w-10 text-navy-700 mx-auto mb-3" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Book Overnight Care</h1>
          <p className="text-gray-600 mt-1">Tap the nights you need care. We&apos;ll handle the rest.</p>
          <p className="text-xs text-gray-400 mt-1">Book up to {BOOKING_WINDOW_DAYS} days ahead</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                  step === s ? 'bg-navy-700 text-white' :
                  stepIndex > i ? 'bg-green-500 text-white' :
                  'bg-gray-200 text-gray-500'
                )}>
                  {stepIndex > i ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className="text-xs text-gray-500 mt-1 hidden sm:block">{stepLabels[i]}</span>
              </div>
              {i < stepOrder.length - 1 && (
                <div className={cn(
                  'w-10 sm:w-16 h-0.5 mb-4 sm:mb-5 transition-colors',
                  stepIndex > i ? 'bg-green-500' : 'bg-gray-200',
                )} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className={cn(
            'px-4 py-3 rounded-xl mb-6 flex items-start gap-2',
            errorCode === 'PROFILE_INCOMPLETE'
              ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
              : 'bg-red-50 text-red-700'
          )}>
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <div>{error}</div>
              {errorCode === 'PROFILE_INCOMPLETE' && (
                <button
                  onClick={() => router.push('/dashboard/children')}
                  className="mt-2 text-sm font-semibold underline hover:no-underline"
                >
                  Go to Child Profile
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Calendar */}
        {step === 'calendar' && (
          <div className="card">
            <CalendarSelector
              operatingNights={operatingNights}
              capacity={capacity}
              nightCapacity={nightCapacity}
              selectedNights={selectedNights}
              onToggleNight={toggleNight}
            />
          </div>
        )}

        {/* Step 2: Select Child */}
        {step === 'child' && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => { setStep('calendar'); setError(''); setErrorCode(null); }}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-semibold text-gray-900">Select a Child</h2>
            </div>

            {/* Summary of selected nights */}
            <div className="bg-navy-50/50 rounded-xl p-3 mb-4 border border-navy-100">
              <div className="text-sm text-navy-600 mb-1">
                {selectedNights.size} night{selectedNights.size !== 1 ? 's' : ''} selected
                {matchedPlan && (
                  <span className="ml-1">&middot; {formatCents(matchedPlan.price_cents)}/week</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedNights.map(dateStr => (
                  <span key={dateStr} className="text-xs font-medium bg-navy-100 text-navy-800 px-2 py-0.5 rounded-lg border border-navy-200">
                    {format(parseISO(dateStr), 'EEE, MMM d')}
                  </span>
                ))}
              </div>
            </div>

            {children.length === 0 ? (
              <EmptyStateCard
                icon={<Users className="h-8 w-8" />}
                title="No children added"
                description="Add your child to begin booking overnight care."
                actionLabel="Add Child"
                actionHref="/dashboard/children"
              />
            ) : (
              <div className="space-y-3">
                {children.map(child => {
                  const complete = isChildProfileComplete(child);
                  const safetyInfo = childToSafetyInfo(child);
                  return (
                    <button
                      key={child.id}
                      onClick={() => handleSelectChild(child.id)}
                      className={cn(
                        'w-full text-left rounded-2xl border-2 transition-all',
                        selectedChild === child.id ? 'border-navy-600 bg-navy-50/30 shadow-soft-sm' : 'border-gray-200 hover:border-gray-300 hover:shadow-soft-sm'
                      )}
                    >
                      <ChildSafetyCard child={safetyInfo} compact showEditLink={false} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && matchedPlan && weekStartDate && selectedChildProfile && (
          <ReservationConfirmationCard
            child={childToSafetyInfo(selectedChildProfile)}
            weekStart={weekStartDate}
            sortedNights={sortedNights}
            matchedPlan={matchedPlan}
            nightCapacity={nightCapacity}
            capacity={capacity}
            authorizedPickups={selectedChildProfile.pickups_data || []}
            caregiverNotes={caregiverNotes}
            onCaregiverNotesChange={setCaregiverNotes}
            onBack={() => { setStep('child'); setError(''); setErrorCode(null); }}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
      </div>

      {/* Floating selected nights bar */}
      {step === 'calendar' && (
        <SelectedNightsBar
          selectedNights={selectedNights}
          onRemoveNight={removeNight}
          pricingTiers={pricingTiers}
          onContinue={handleContinueFromCalendar}
        />
      )}
    </div>
  );
}

function formatAllergen(allergen: string): string {
  const labels: Record<string, string> = {
    PEANUT: 'Peanut', TREE_NUT: 'Tree Nut', MILK: 'Milk', EGG: 'Egg',
    WHEAT: 'Wheat', SOY: 'Soy', FISH: 'Fish', SHELLFISH: 'Shellfish',
    SESAME: 'Sesame', PENICILLIN: 'Penicillin', INSECT_STING: 'Insect Sting',
    LATEX: 'Latex', ASTHMA: 'Asthma', ENVIRONMENTAL: 'Environmental',
  };
  return labels[allergen] || allergen;
}
