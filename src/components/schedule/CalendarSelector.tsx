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

  // Show month range for the visible weeks
  const pageEnd = addDays(startOfWeek(addWeeks(pageStart, 3), { weekStartsOn: 0 }), 6);
  const startMonth = format(pageStart, 'MMMM yyyy');
  const endMonth = format(pageEnd, 'MMMM yyyy');
  const monthLabel = startMonth === endMonth ? startMonth : `${format(pageStart, 'MMM')} \u2013 ${endMonth}`;

  return (
    <div>
      {/* Month header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setPageOffset(p => p - 1)}
          disabled={!canGoBack}
          className={cn(
            'p-2 rounded-lg transition-colors',
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
            'p-2 rounded-lg transition-colors',
            canGoForward ? 'hover:bg-gray-100 text-gray-700' : 'text-gray-300 cursor-not-allowed'
          )}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(label => (
          <div key={label} className="text-center text-xs font-semibold text-gray-500 py-1.5">
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
              const isLow = remaining > 0 && remaining <= 2;

              // Determine capacity label
              let capacityLabel = '';
              let capacityClass = '';
              if (isOperating && !isPast && !isBeyondWindow) {
                if (isFull) {
                  capacityLabel = 'Full';
                  capacityClass = 'text-red-500 font-semibold';
                } else if (isLow) {
                  capacityLabel = `${remaining} bed${remaining !== 1 ? 's' : ''} left`;
                  capacityClass = 'text-amber-600 font-medium';
                } else {
                  capacityLabel = `${remaining} beds left`;
                  capacityClass = 'text-green-600';
                }
              } else if (!isOperating && !isPast && !isBeyondWindow) {
                capacityLabel = 'Closed';
                capacityClass = 'text-gray-400';
              }

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (!isDisabled) onToggleNight(dateStr);
                  }}
                  disabled={isDisabled && !isSelected}
                  className={cn(
                    'relative flex flex-col items-center py-2 px-0.5 rounded-xl transition-all min-h-[58px]',
                    isSelected
                      ? 'bg-navy-600 text-white shadow-soft-sm ring-2 ring-navy-400 ring-offset-1'
                      : isDisabled
                        ? 'text-gray-300 cursor-default bg-gray-50'
                        : isFull
                          ? 'text-gray-400 bg-red-50/50 hover:bg-red-50 cursor-pointer'
                          : isLow
                            ? 'text-gray-900 bg-amber-50/30 hover:bg-amber-50 cursor-pointer'
                            : 'text-gray-900 hover:bg-navy-50 cursor-pointer',
                    isToday && !isSelected && 'ring-2 ring-accent-500 ring-offset-1'
                  )}
                >
                  <span className={cn(
                    'text-sm font-medium leading-tight',
                    isSelected && 'font-bold'
                  )}>
                    {format(date, 'd')}
                  </span>

                  {/* Capacity indicator */}
                  {capacityLabel && (
                    <span className={cn(
                      'text-[9px] leading-tight mt-0.5 text-center',
                      isSelected ? 'text-navy-200' : capacityClass
                    )}>
                      {capacityLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-navy-600 shadow-sm" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
          <span>Low availability</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span>Full (waitlist)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" />
          <span>Closed</span>
        </div>
      </div>
    </div>
  );
}
