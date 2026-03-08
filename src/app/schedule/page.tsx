'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, AlertCircle, Check, Clock, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_PRICING_TIERS, DEFAULT_OPERATING_NIGHTS, formatCents, DAY_LABELS, DEFAULT_CAPACITY, BOOKING_WINDOW_DAYS, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { getWeekNights, cn, formatWeekRange, getUpcomingWeeks } from '@/lib/utils';
import { DayOfWeek, Child, AdminSettings, PricingTier } from '@/types/database';
import CalendarSelector from '@/components/schedule/CalendarSelector';
import SelectedNightsBar from '@/components/schedule/SelectedNightsBar';
import CalendarView from '@/components/schedule/CalendarView';
import { format, parseISO, startOfWeek } from 'date-fns';

interface ChildProfile extends Child {
  emergency_contacts_count: number;
  authorized_pickups_count: number;
}

function autoCalculatePlan(nightCount: number, pricingTiers: PricingTier[]): PricingTier | null {
  return pricingTiers.find(t => t.nights === nightCount) ?? null;
}

export default function SchedulePage() {
  const router = useRouter();
  const [step, setStep] = useState<'calendar' | 'child' | 'confirm'>('calendar');
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [selectedNights, setSelectedNights] = useState<Set<string>>(new Set());
  const [nightCapacity, setNightCapacity] = useState<Record<string, number>>({});
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

  // Derive the week start from selected nights for the booking API
  const sortedNights = Array.from(selectedNights).sort();
  const weekStartDate = sortedNights.length > 0
    ? startOfWeek(parseISO(sortedNights[0]), { weekStartsOn: 0 })
    : null;

  // Build booked nights for CalendarView
  const bookedNightsForCalendar = sortedNights.map(dateStr => {
    const count = nightCapacity[dateStr] ?? 0;
    const isFull = count >= capacity;
    const childProfile = children.find((c: ChildProfile) => c.id === selectedChild);
    return {
      date: dateStr,
      status: isFull ? 'waitlisted' : 'pending_payment',
      childName: childProfile ? `${childProfile.first_name} ${childProfile.last_name}` : 'Selected',
    };
  });

  const loadCapacity = useCallback(async (opNights: DayOfWeek[]) => {
    // Load capacity for all weeks in the booking window
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
            child_authorized_pickups(id)
          `)
          .eq('parent_id', parentId),
        supabase.from('admin_settings').select('*').limit(1).single(),
      ]);

      if (childrenRes.data) {
        const enriched: ChildProfile[] = childrenRes.data.map((c: Record<string, unknown>) => ({
          ...c,
          emergency_contacts_count: Array.isArray(c.child_emergency_contacts) ? c.child_emergency_contacts.length : 0,
          authorized_pickups_count: Array.isArray(c.child_authorized_pickups) ? c.child_authorized_pickups.length : 0,
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

  return (
    <div className="py-12 pb-32">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <Calendar className="h-10 w-10 text-navy-700 mx-auto mb-3" />
          <h1 className="text-3xl font-bold text-gray-900">Reserve Nights</h1>
          <p className="text-gray-600 mt-1">Tap the nights you need care. We&apos;ll handle the rest.</p>
          <p className="text-xs text-gray-400 mt-1">Book up to {BOOKING_WINDOW_DAYS} days ahead</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                  step === s ? 'bg-navy-700 text-white' :
                  stepIndex > i ? 'bg-green-500 text-white' :
                  'bg-gray-200 text-gray-500'
                )}>
                  {stepIndex > i ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className="text-xs text-gray-500 mt-1 hidden sm:block">{stepLabels[i]}</span>
              </div>
              {i < stepOrder.length - 1 && <div className="w-10 sm:w-16 h-0.5 bg-gray-200 mb-4 sm:mb-5" />}
            </div>
          ))}
        </div>

        {error && (
          <div className={cn(
            'px-4 py-3 rounded-lg mb-6 flex items-start gap-2',
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
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-semibold text-gray-900">Select a Child</h2>
            </div>

            {/* Summary of selected nights */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="text-sm text-gray-500 mb-1">
                {selectedNights.size} night{selectedNights.size !== 1 ? 's' : ''} selected
                {matchedPlan && (
                  <span className="ml-1">&middot; {formatCents(matchedPlan.price_cents)}/week</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortedNights.map(dateStr => (
                  <span key={dateStr} className="text-xs font-medium bg-navy-50 text-navy-800 px-2 py-0.5 rounded-full">
                    {format(parseISO(dateStr), 'EEE MMM d')}
                  </span>
                ))}
              </div>
            </div>

            {children.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">You haven&apos;t added any children yet.</p>
                <button onClick={() => router.push('/dashboard/children')} className="btn-primary">
                  Add a Child
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {children.map(child => {
                  const complete = isChildProfileComplete(child);
                  return (
                    <button
                      key={child.id}
                      onClick={() => handleSelectChild(child.id)}
                      className={cn(
                        'w-full text-left p-4 rounded-lg border-2 transition-colors',
                        selectedChild === child.id ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-semibold text-gray-900">{child.first_name} {child.last_name}</div>
                          <div className="text-sm text-gray-500">DOB: {child.date_of_birth}</div>
                        </div>
                        {!complete && (
                          <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Profile incomplete
                          </span>
                        )}
                      </div>
                      {!complete && (
                        <div className="mt-2 text-xs text-yellow-700">
                          {getProfileIncompleteMessage(child)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && matchedPlan && weekStartDate && (
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => { setStep('child'); setError(''); setErrorCode(null); }}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-xl font-semibold text-gray-900">Confirm Reservation</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Child</div>
                <div className="font-semibold text-gray-900">
                  {children.find(c => c.id === selectedChild)?.first_name}{' '}
                  {children.find(c => c.id === selectedChild)?.last_name}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-2">Dates</div>
                <div className="space-y-1.5">
                  {sortedNights.map(dateStr => {
                    const date = parseISO(dateStr);
                    const count = nightCapacity[dateStr] ?? 0;
                    const isFull = count >= capacity;
                    return (
                      <div key={dateStr} className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-navy-700 flex-shrink-0" />
                        <span className="font-medium text-gray-900">
                          {format(date, 'EEEE, MMM d')}
                        </span>
                        <span className="text-sm text-gray-500">
                          {OVERNIGHT_START} &ndash; {OVERNIGHT_END}
                        </span>
                        {isFull && <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full ml-auto">Waitlist</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Total</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">
                    {formatCents(matchedPlan.price_cents)}
                  </span>
                  <span className="text-sm text-gray-500">/week &middot; {matchedPlan.nights} nights</span>
                </div>
              </div>
            </div>

            {/* Calendar preview */}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <CalendarView
                bookedNights={bookedNightsForCalendar}
                weekStart={weekStartDate}
                operatingNights={operatingNights}
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep('child')} className="btn-secondary">Back</button>
              <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Processing...' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
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
