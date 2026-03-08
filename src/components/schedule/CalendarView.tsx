'use client';

import { useState } from 'react';
import { List, CalendarDays, CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DAY_SHORT_LABELS, DAY_LABELS, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { DayOfWeek } from '@/types/database';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';

interface BookedNight {
  date: string;
  status: string;
  childName: string;
}

interface CalendarViewProps {
  bookedNights: BookedNight[];
  weekStart: Date;
  operatingNights: DayOfWeek[];
}

type ViewMode = 'list' | 'calendar';

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: 'bg-green-500',
    pending_payment: 'bg-yellow-500',
    locked: 'bg-navy-500',
    canceled: 'bg-gray-400',
    canceled_low_enrollment: 'bg-orange-400',
    waitlisted: 'bg-yellow-500',
  };
  return <span className={cn('inline-block w-2 h-2 rounded-full', colors[status] || 'bg-gray-400')} />;
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, { text: string; className: string; icon: React.ReactNode }> = {
    confirmed: {
      text: 'Confirmed',
      className: 'text-green-700 bg-green-50 border-green-200',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    pending_payment: {
      text: 'Pending',
      className: 'text-yellow-700 bg-yellow-50 border-yellow-200',
      icon: <Clock className="h-3 w-3" />,
    },
    locked: {
      text: 'Locked',
      className: 'text-navy-700 bg-navy-50 border-navy-200',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    canceled: {
      text: 'Cancelled',
      className: 'text-gray-500 bg-gray-50 border-gray-200',
      icon: <XCircle className="h-3 w-3" />,
    },
  };

  const cfg = labels[status] || { text: status, className: 'text-gray-500 bg-gray-50 border-gray-200', icon: null };

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.className)}>
      {cfg.icon}
      {cfg.text}
    </span>
  );
}

export default function CalendarView({ bookedNights, weekStart, operatingNights }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const allDays: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Build 7 calendar cells for the week
  const weekDays = allDays.map((day, i) => {
    const cellDate = addDays(startOfWeek(weekStart, { weekStartsOn: 0 }), i);
    const dateStr = format(cellDate, 'yyyy-MM-dd');
    const isOperating = operatingNights.includes(day);
    const bookings = bookedNights.filter(b => b.date === dateStr);
    return { day, date: cellDate, dateStr, isOperating, bookings };
  });

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setViewMode('list')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            viewMode === 'list'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <List className="h-4 w-4" />
          List View
        </button>
        <button
          onClick={() => setViewMode('calendar')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            viewMode === 'calendar'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <CalendarDays className="h-4 w-4" />
          Calendar View
        </button>
      </div>

      {viewMode === 'list' ? (
        /* List View */
        <div className="space-y-2">
          {bookedNights.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No booked nights for this week.
            </div>
          ) : (
            bookedNights.map((night, i) => {
              const dateObj = parseISO(night.date);
              return (
                <div key={`${night.date}-${i}`} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-navy-50 flex flex-col items-center justify-center">
                      <span className="text-xs font-semibold text-navy-600 leading-none">
                        {format(dateObj, 'MMM')}
                      </span>
                      <span className="text-sm font-bold text-navy-800 leading-tight">
                        {format(dateObj, 'd')}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {format(dateObj, 'EEEE')}
                      </div>
                      <div className="text-xs text-gray-500">
                        {night.childName} &middot; {OVERNIGHT_START} &ndash; {OVERNIGHT_END}
                      </div>
                    </div>
                  </div>
                  <StatusLabel status={night.status} />
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Calendar View */
        <div className="grid grid-cols-7 gap-1">
          {/* Header */}
          {allDays.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
              {DAY_SHORT_LABELS[day]}
            </div>
          ))}

          {/* Day cells */}
          {weekDays.map(({ day, date, isOperating, bookings }) => {
            const isToday = isSameDay(date, new Date());
            const hasBookings = bookings.length > 0;

            return (
              <div
                key={day}
                className={cn(
                  'min-h-[80px] rounded-lg border p-1.5 text-center',
                  !isOperating && 'bg-gray-50 border-gray-100',
                  isOperating && !hasBookings && 'border-gray-200 bg-white',
                  hasBookings && 'border-navy-200 bg-navy-50',
                  isToday && 'ring-2 ring-accent-500'
                )}
              >
                <div className={cn(
                  'text-xs font-medium mb-1',
                  isToday ? 'text-accent-700 font-bold' : 'text-gray-700'
                )}>
                  {format(date, 'd')}
                </div>
                {bookings.map((b, i) => (
                  <div key={i} className="flex items-center justify-center gap-1 mb-0.5">
                    <StatusDot status={b.status} />
                    <span className="text-xs text-gray-700 truncate">{b.childName.split(' ')[0]}</span>
                  </div>
                ))}
                {!isOperating && (
                  <span className="text-xs text-gray-400">-</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
