'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatWeekRange, getUpcomingWeeks } from '@/lib/utils';
import { BOOKING_WINDOW_DAYS } from '@/lib/constants';

interface WeekPickerProps {
  selectedWeek: Date | null;
  onSelectWeek: (weekStart: Date) => void;
}

const WEEKS_TO_SHOW = 5;

export default function WeekPicker({ selectedWeek, onSelectWeek }: WeekPickerProps) {
  const weeks = getUpcomingWeeks(WEEKS_TO_SHOW, BOOKING_WINDOW_DAYS);

  return (
    <div className="space-y-2">
      {weeks.map((weekStart) => {
        const isSelected = selectedWeek?.getTime() === weekStart.getTime();
        const label = formatWeekRange(weekStart);

        return (
          <button
            key={weekStart.toISOString()}
            onClick={() => onSelectWeek(weekStart)}
            className={cn(
              'w-full text-left px-4 py-3 rounded-lg border-2 transition-colors flex items-center justify-between',
              isSelected
                ? 'border-navy-600 bg-navy-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <span className={cn(
              'font-medium',
              isSelected ? 'text-navy-800' : 'text-gray-900'
            )}>
              {label}
            </span>
            <ChevronRight className={cn(
              'h-4 w-4',
              isSelected ? 'text-navy-600' : 'text-gray-400'
            )} />
          </button>
        );
      })}
    </div>
  );
}
