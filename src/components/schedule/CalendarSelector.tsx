'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BOOKING_WINDOW_DAYS } from '@/lib/constants';
import { DayOfWeek } from '@/types/database';
import {
  format,
  addDays,
  addWeeks,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isBefore,
  isAfter,
  parseISO,
} from 'date-fns';

interface CalendarSelectorProps {
  operatingNights: DayOfWeek[];
  capacity: number;
  nightCapacity: Record<string, number>;
  selectedNights: Set<string>;
  onToggleNight: (dateStr: string) => void;
}

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function getWeeksInRange(rangeStart: Date, weeksCount: number) {
  const weeks: Date[][] = [];
  for (let w = 0; w < weeksCount; w++) {
    const weekStart = startOfWeek(addWeeks(rangeStart, w), { weekStartsOn: 0 });
    const days: Date[] = [];
    for (let d = 0; d < 7; d++) {
      days.push(addDays(weekStart, d));
    }
    weeks.push(days);
  }
  return weeks;
}

export default function CalendarSelector({
  operatingNights,
  capacity,
  nightCapacity,
  selectedNights,
  onToggleNight,
}: CalendarSelectorProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, BOOKING_WINDOW_DAYS);

  // Show current week as starting point, navigate by 4-week pages
  const [pageOffset, setPageOffset] = useState(0);
  const pageStart = startOfWeek(addWeeks(today, pageOffset * 4), { weekStartsOn: 0 });
  const weeks = getWeeksInRange(pageStart, 4);

  const operatingDayIndexes = new Set(operatingNights.map(d => DAY_INDEX[d]));

  const canGoBack = pageOffset > 0;
  const canGoForward = isBefore(addWeeks(pageStart, 4), addDays(maxDate, 7));

  const monthLabel = format(pageStart, 'MMMM yyyy');

  return (
    <div>
      {/* Month header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setPageOffset(p => p - 1)}
          disabled={!canGoBack}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            canGoBack ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'
          )}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900">{monthLabel}</h3>
        <button
          onClick={() => setPageOffset(p => p + 1)}
          disabled={!canGoForward}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            canGoForward ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(label => (
          <div key={label} className="text-center text-xs font-semibold text-gray-500 py-1">
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const dayOfWeek = date.getDay();
              const isOperating = operatingDayIndexes.has(dayOfWeek);
              const isPast = isBefore(date, today);
              const isBeyondWindow = isAfter(date, maxDate);
              const isDisabled = !isOperating || isPast || isBeyondWindow;
              const isSelected = selectedNights.has(dateStr);
              const isToday = isSameDay(date, today);

              const count = nightCapacity[dateStr] ?? 0;
              const remaining = capacity - count;
              const isFull = remaining <= 0;

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (!isDisabled) onToggleNight(dateStr);
                  }}
                  disabled={isDisabled && !isSelected}
                  className={cn(
                    'relative flex flex-col items-center py-2 px-1 rounded-lg transition-colors min-h-[52px]',
                    isSelected
                      ? 'bg-navy-600 text-white shadow-sm'
                      : isDisabled
                        ? 'text-gray-300 cursor-default'
                        : isFull
                          ? 'text-gray-400 hover:bg-gray-50 cursor-pointer'
                          : 'text-gray-900 hover:bg-navy-50 cursor-pointer',
                    isToday && !isSelected && 'ring-2 ring-accent-500 ring-inset'
                  )}
                >
                  <span className={cn(
                    'text-sm font-medium',
                    isSelected && 'font-bold'
                  )}>
                    {format(date, 'd')}
                  </span>

                  {/* Capacity indicator */}
                  {isOperating && !isPast && !isBeyondWindow && (
                    <span className={cn(
                      'text-[10px] leading-tight mt-0.5',
                      isSelected
                        ? 'text-navy-200'
                        : isFull
                          ? 'text-red-500 font-medium'
                          : remaining <= 2
                            ? 'text-yellow-600'
                            : 'text-green-600'
                    )}>
                      {isFull ? 'Full' : `${remaining} left`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-navy-600" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-green-600 font-medium">3 left</span>
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-red-500 font-medium">Full</span>
          <span>Waitlist</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-300">&mdash;</span>
          <span>Closed</span>
        </div>
      </div>
    </div>
  );
}
