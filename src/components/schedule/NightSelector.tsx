'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DAY_LABELS, BOOKING_WINDOW_DAYS } from '@/lib/constants';
import { getWeekNights, isWithinBookingWindow } from '@/lib/utils';
import { DayOfWeek } from '@/types/database';
import { format } from 'date-fns';

interface NightSelectorProps {
  weekStart: Date;
  operatingNights: DayOfWeek[];
  capacity: number;
  nightCapacity: Record<string, number>;
  selectedNights: Set<string>;
  maxSelectable: number;
  onToggleNight: (dateStr: string) => void;
}

type NightStatus = 'available' | 'full' | 'waitlist' | 'outside_window';

function getNightStatus(
  dateStr: string,
  count: number,
  capacity: number,
): NightStatus {
  if (!isWithinBookingWindow(dateStr, BOOKING_WINDOW_DAYS)) {
    return 'outside_window';
  }
  if (count >= capacity) {
    return 'full';
  }
  return 'available';
}

function StatusBadge({ status, remaining, capacity }: { status: NightStatus; remaining: number; capacity: number }) {
  switch (status) {
    case 'available':
      return (
        <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
          {remaining}/{capacity} spots
        </span>
      );
    case 'full':
      return (
        <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
          Full
        </span>
      );
    case 'waitlist':
      return (
        <span className="text-xs font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
          Waitlist
        </span>
      );
    case 'outside_window':
      return (
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          Not available
        </span>
      );
  }
}

export default function NightSelector({
  weekStart,
  operatingNights,
  capacity,
  nightCapacity,
  selectedNights,
  maxSelectable,
  onToggleNight,
}: NightSelectorProps) {
  const weekNights = getWeekNights(weekStart, operatingNights);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      {weekNights.map(({ day, dateStr, date }) => {
        const count = nightCapacity[dateStr] ?? 0;
        const remaining = capacity - count;
        const status = getNightStatus(dateStr, count, capacity);
        const isSelected = selectedNights.has(dateStr);
        const isDisabled = status === 'outside_window' || (status === 'full' && !isSelected);
        const canSelect = !isDisabled && (isSelected || selectedNights.size < maxSelectable);

        const dayLabel = DAY_LABELS[day];
        const dateLabel = format(date, 'MMM d');

        return (
          <button
            key={dateStr}
            onClick={() => {
              if (canSelect) onToggleNight(dateStr);
            }}
            disabled={isDisabled && !isSelected}
            className={cn(
              'flex flex-col items-center p-4 rounded-xl border-2 transition-colors text-center',
              isSelected
                ? 'border-navy-600 bg-navy-50 shadow-sm'
                : isDisabled
                  ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <div className="text-sm font-bold text-gray-900 mb-0.5">{dayLabel}</div>
            <div className="text-xs text-gray-500 mb-3">{dateLabel}</div>
            <StatusBadge status={status} remaining={remaining} capacity={capacity} />
            {isSelected && <Check className="h-5 w-5 text-navy-700 mt-2" />}
          </button>
        );
      })}
    </div>
  );
}
