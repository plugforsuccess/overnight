'use client';

import { Clock, MapPin, ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatWeekRange } from '@/lib/utils';
import { formatCents, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { PricingTier } from '@/types/database';
import { ChildSafetyCard, ChildSafetyInfo } from '@/components/ui/ChildSafetyCard';
import { SafetyChipRow } from '@/components/ui/SafetyChipRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CaregiverNotesCard } from '@/components/ui/CaregiverNotesCard';

interface Props {
  child: ChildSafetyInfo;
  weekStart: Date;
  sortedNights: string[];
  matchedPlan: PricingTier;
  nightCapacity: Record<string, number>;
  capacity: number;
  caregiverNotes: string;
  onCaregiverNotesChange: (notes: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function ReservationConfirmationCard({
  child,
  weekStart,
  sortedNights,
  matchedPlan,
  nightCapacity,
  capacity,
  caregiverNotes,
  onCaregiverNotesChange,
  onBack,
  onSubmit,
  submitting,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-semibold text-gray-900">Confirm Booking</h2>
      </div>

      {/* Section 1 — Child */}
      <ChildSafetyCard child={child} compact showEditLink={false} />

      {/* Section 2 — Week + nights */}
      <div className="rounded-2xl border border-navy-200 bg-navy-50/30 p-4">
        <div className="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">Booking</div>
        <div className="text-lg font-bold text-navy-900 mb-3">
          Week of {formatWeekRange(weekStart)}
        </div>
        <div className="space-y-2">
          {sortedNights.map(dateStr => {
            const date = parseISO(dateStr);
            const count = nightCapacity[dateStr] ?? 0;
            const isFull = count >= capacity;
            return (
              <div key={dateStr} className="flex items-center justify-between bg-white rounded-xl p-3 border border-navy-100">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-navy-100 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold text-navy-600 leading-none uppercase">
                      {format(date, 'MMM')}
                    </span>
                    <span className="text-sm font-bold text-navy-800 leading-tight">
                      {format(date, 'd')}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{format(date, 'EEEE')}</div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {OVERNIGHT_START} &ndash; {OVERNIGHT_END}
                    </div>
                  </div>
                </div>
                {isFull && <StatusBadge status="waitlisted" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3 — Care window */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft-sm">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Care details</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 block text-xs mb-0.5">Dropoff</span>
            <span className="font-medium text-gray-900">{OVERNIGHT_START}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs mb-0.5">Pickup</span>
            <span className="font-medium text-gray-900">{OVERNIGHT_END}</span>
          </div>
        </div>
      </div>

      {/* Section 4 — Pricing */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft-sm">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Plan</div>
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-sm text-gray-600">{matchedPlan.nights}-Night Plan</span>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-gray-900">{formatCents(matchedPlan.price_cents)}</span>
            <span className="text-sm text-gray-500 ml-1">/week</span>
          </div>
        </div>
      </div>

      {/* Section 5 — Caregiver notes */}
      <CaregiverNotesCard
        notes={caregiverNotes}
        onChange={onCaregiverNotesChange}
      />

      {/* Section 6 — Trust / safety panel */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Safety readiness</div>
        <SafetyChipRow
          emergencyContactsCount={child.emergency_contacts_count}
          authorizedPickupsCount={child.authorized_pickups_count}
          hasMedicalProfile={child.has_medical_profile}
          hasAllergyInfo={child.allergies.length > 0}
          hasCareNotes={!!caregiverNotes}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="btn-secondary flex-shrink-0">
          Edit Nights
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="btn-primary flex-1 text-base py-3"
        >
          {submitting ? 'Processing...' : 'Confirm Booking'}
        </button>
      </div>
    </div>
  );
}
