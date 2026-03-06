'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, AlertCircle, Check, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_PRICING_TIERS, DEFAULT_OPERATING_NIGHTS, formatCents, DAY_LABELS, DEFAULT_CAPACITY } from '@/lib/constants';
import { getWeekNights, getNextWeekStart, cn } from '@/lib/utils';
import { DayOfWeek, Child, AdminSettings } from '@/types/database';

export default function SchedulePage() {
  const router = useRouter();
  const [step, setStep] = useState<'plan' | 'nights' | 'child' | 'confirm'>('plan');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<number>(0);
  const [selectedNights, setSelectedNights] = useState<Set<string>>(new Set());
  const [nightCapacity, setNightCapacity] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const weekStart = getNextWeekStart();
  const pricingTiers = settings?.pricing_tiers ?? DEFAULT_PRICING_TIERS;
  const operatingNights = (settings?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[];
  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;
  const weekNights = getWeekNights(weekStart, operatingNights);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const user = session.user;

      // parents.id = auth user ID
      const parentId = user.id;
      setUserId(parentId);

      const [childrenRes, settingsRes] = await Promise.all([
        supabase.from('children').select('*').eq('parent_id', parentId),
        supabase.from('admin_settings').select('*').limit(1).single(),
      ]);

      if (childrenRes.data) setChildren(childrenRes.data);
      if (settingsRes.data) setSettings(settingsRes.data as AdminSettings);

      // Load capacity for each night
      const nightDates = getWeekNights(
        getNextWeekStart(),
        (settingsRes.data?.operating_nights ?? DEFAULT_OPERATING_NIGHTS) as DayOfWeek[]
      ).map(n => n.dateStr);

      const { data: reservations } = await supabase
        .from('reservations')
        .select('night_date')
        .in('night_date', nightDates)
        .eq('status', 'confirmed');

      const counts: Record<string, number> = {};
      nightDates.forEach(d => counts[d] = 0);
      reservations?.forEach(r => {
        counts[r.night_date] = (counts[r.night_date] || 0) + 1;
      });
      setNightCapacity(counts);
      setLoading(false);
    }
    load();
  }, [router]);

  function toggleNight(dateStr: string) {
    const updated = new Set(selectedNights);
    if (updated.has(dateStr)) {
      updated.delete(dateStr);
    } else {
      if (updated.size >= selectedPlan) return;
      updated.add(dateStr);
    }
    setSelectedNights(updated);
  }

  async function handleSubmit() {
    if (!userId) {
      setError('Session expired. Please log in again.');
      router.push('/login');
      return;
    }
    if (!selectedChild || selectedPlan === 0 || selectedNights.size !== selectedPlan) {
      setError('Please complete all steps before confirming.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      // Get auth token for server API calls
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Session expired. Please log in again.');
        router.push('/login');
        return;
      }
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      // Create plan + reservations via server API (handles capacity, validation, pricing)
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          childId: selectedChild,
          nightsPerWeek: selectedPlan,
          selectedNights: Array.from(selectedNights),
          weekStart: weekNights[0]?.dateStr,
        }),
      });

      const bookingData = await bookingRes.json();
      if (!bookingRes.ok) throw new Error(bookingData.error || 'Failed to create booking');

      // Create Stripe checkout via server API
      const stripeRes = await fetch('/api/stripe', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ planId: bookingData.plan.id }),
      });

      const { url } = await stripeRes.json();
      if (url) {
        window.location.href = url;
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
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

  const stepOrder = ['plan', 'nights', 'child', 'confirm'] as const;
  const stepIndex = stepOrder.indexOf(step);

  return (
    <div className="py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Calendar className="h-12 w-12 text-navy-700 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">Reserve Your Nights</h1>
          <p className="text-gray-600 mt-2">Choose your plan, pick your nights, and confirm your booking</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                step === s ? 'bg-navy-700 text-white' :
                stepIndex > i ? 'bg-green-500 text-white' :
                'bg-gray-200 text-gray-500'
              )}>
                {stepIndex > i ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < 3 && <div className="w-12 h-0.5 bg-gray-200" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        {/* Step 1: Select Plan */}
        {step === 'plan' && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Choose Your Weekly Plan</h2>
            <p className="text-gray-600 mb-4">Weekly plans reserve your spot&mdash;paid weekly in advance.</p>
            <div className="space-y-3">
              {pricingTiers.map(tier => (
                <button
                  key={tier.nights}
                  onClick={() => { setSelectedPlan(tier.nights); setSelectedNights(new Set()); setStep('nights'); }}
                  className={cn(
                    'w-full text-left p-4 rounded-lg border-2 transition-colors',
                    selectedPlan === tier.nights ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {tier.nights} Night{tier.nights > 1 ? 's' : ''} per Week
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatCents(Math.round(tier.price_cents / tier.nights))}/night
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {formatCents(tier.price_cents)}<span className="text-sm font-normal text-gray-500">/wk</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Nights — Week Grid (Sun–Thu) */}
        {step === 'nights' && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Select Your Nights</h2>
            <p className="text-gray-600 mb-6">
              Choose {selectedPlan} night{selectedPlan > 1 ? 's' : ''} for next week.
              Week of {weekNights[0]?.dateStr}.
            </p>

            {/* Week Grid */}
            <div className="grid grid-cols-5 gap-3 mb-6">
              {weekNights.map(({ day, dateStr }) => {
                const count = nightCapacity[dateStr] ?? 0;
                const remaining = capacity - count;
                const isFull = remaining <= 0;
                const isSelected = selectedNights.has(dateStr);
                const canSelect = !isFull && (isSelected || selectedNights.size < selectedPlan);

                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      if (isFull && !isSelected) return;
                      if (canSelect) toggleNight(dateStr);
                    }}
                    className={cn(
                      'flex flex-col items-center p-4 rounded-xl border-2 transition-colors text-center',
                      isSelected ? 'border-navy-600 bg-navy-50 shadow-sm' :
                      isFull ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' :
                      'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="text-sm font-bold text-gray-900 mb-1">{DAY_LABELS[day]}</div>
                    <div className="text-xs text-gray-400 mb-3">{dateStr.slice(5)}</div>
                    {isFull ? (
                      <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                        Join waitlist
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        {remaining}/{capacity} spots
                      </span>
                    )}
                    {isSelected && <Check className="h-5 w-5 text-navy-700 mt-2" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('plan')} className="btn-secondary">Back</button>
              <button
                onClick={() => setStep('child')}
                disabled={selectedNights.size !== selectedPlan}
                className="btn-primary flex-1"
              >
                Continue ({selectedNights.size}/{selectedPlan} selected)
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Select Child */}
        {step === 'child' && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Select a Child</h2>
            {children.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">You haven&apos;t added any children yet.</p>
                <button onClick={() => router.push('/dashboard/children')} className="btn-primary">
                  Add a Child
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => { setSelectedChild(child.id); setStep('confirm'); }}
                    className={cn(
                      'w-full text-left p-4 rounded-lg border-2 transition-colors',
                      selectedChild === child.id ? 'border-navy-600 bg-navy-50' : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div className="font-semibold text-gray-900">{child.first_name} {child.last_name}</div>
                    <div className="text-sm text-gray-500">DOB: {child.date_of_birth}</div>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setStep('nights')} className="btn-secondary mt-4">Back</button>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Confirm Your Booking</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Plan</div>
                <div className="font-semibold">
                  {selectedPlan} Night{selectedPlan > 1 ? 's' : ''}/Week &mdash;{' '}
                  {formatCents(pricingTiers.find(t => t.nights === selectedPlan)!.price_cents)}/week
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Selected Nights</div>
                <div className="space-y-1">
                  {Array.from(selectedNights).sort().map(dateStr => {
                    const night = weekNights.find(n => n.dateStr === dateStr);
                    const count = nightCapacity[dateStr] ?? 0;
                    const isFull = count >= capacity;
                    return (
                      <div key={dateStr} className="font-semibold flex items-center gap-2">
                        <Clock className="h-4 w-4 text-navy-700" />
                        {night ? DAY_LABELS[night.day] : ''} ({dateStr}) &mdash; 9:00 PM to 7:00 AM
                        {isFull && <span className="badge-yellow text-xs ml-2">Waitlisted</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Child</div>
                <div className="font-semibold">{children.find(c => c.id === selectedChild)?.first_name} {children.find(c => c.id === selectedChild)?.last_name}</div>
              </div>
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
    </div>
  );
}
