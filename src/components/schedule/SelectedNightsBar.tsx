'use client';

import { X, Moon, ArrowRight } from 'lucide-react';
import { cn, formatWeekRange } from '@/lib/utils';
import { formatCents } from '@/lib/constants';
import { PricingTier } from '@/types/database';
import { format, parseISO, startOfWeek } from 'date-fns';

interface SelectedNightsBarProps {
  selectedNights: Set<string>;
  onRemoveNight: (dateStr: string) => void;
  pricingTiers: PricingTier[];
  onContinue: () => void;
}

function autoCalculatePlan(nightCount: number, pricingTiers: PricingTier[]): PricingTier | null {
  return pricingTiers.find(t => t.nights === nightCount) ?? null;
}

export default function SelectedNightsBar({
  selectedNights,
  onRemoveNight,
  pricingTiers,
  onContinue,
}: SelectedNightsBarProps) {
  const nightCount = selectedNights.size;
  if (nightCount === 0) return null;

  const sortedNights = Array.from(selectedNights).sort();
  const matchedPlan = autoCalculatePlan(nightCount, pricingTiers);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-lg z-40 px-4 py-3 sm:py-4">
      <div className="max-w-4xl mx-auto">
        {/* Selected nights pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {sortedNights.map(dateStr => {
            const date = parseISO(dateStr);
            return (
              <span
                key={dateStr}
                className="inline-flex items-center gap-1.5 bg-navy-100 text-navy-800 text-sm font-medium px-2.5 py-1 rounded-lg border border-navy-200"
              >
                <Moon className="h-3 w-3 text-navy-500" />
                {format(date, 'EEE, MMM d')}
                <button
                  onClick={() => onRemoveNight(dateStr)}
                  className="text-navy-400 hover:text-navy-700 transition-colors ml-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>

        {/* Week label + plan auto-calculation and continue */}
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-gray-900">
              {nightCount} night{nightCount !== 1 ? 's' : ''} selected
            </span>
            <span className="text-xs text-gray-400">
              Week of {formatWeekRange(startOfWeek(parseISO(sortedNights[0]), { weekStartsOn: 0 }))}
            </span>
            {matchedPlan ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                {formatCents(matchedPlan.price_cents)}/week
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                No plan for {nightCount} night{nightCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={onContinue}
            disabled={!matchedPlan}
            className={cn(
              'btn-primary text-sm px-5 inline-flex items-center gap-2',
              !matchedPlan && 'opacity-50 cursor-not-allowed'
            )}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
