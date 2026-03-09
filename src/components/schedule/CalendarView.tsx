'use client';

import { useState } from 'react';
import { List, CalendarDays, CheckCircle, Clock, XCircle, AlertTriangle, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DAY_SHORT_LABELS, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
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

const STATUS_CONFIG: Record<string, {
  text: string;
  dotClass: string;
  badgeClass: string;
  icon: React.ReactNode;
}> = {
  confirmed: {
    text: 'Confirmed',
    dotClass: 'bg-green-500',
    badgeClass: 'text-green-700 bg-green-50 border-green-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  pending_payment: {
    text: 'Pending',
    dotClass: 'bg-yellow-500',
    badgeClass: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    icon: <Clock className="h-3 w-3" />,
  },
  locked: {
    text: 'Locked',
    dotClass: 'bg-navy-500',
    badgeClass: 'text-navy-700 bg-navy-50 border-navy-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  cancelled: {
    text: 'Cancelled',
    dotClass: 'bg-gray-400',
    badgeClass: 'text-gray-500 bg-gray-50 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
  canceled: {
    text: 'Cancelled',
    dotClass: 'bg-gray-400',
    badgeClass: 'text-gray-500 bg-gray-50 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
  canceled_low_enrollment: {
    text: 'Low Enrollment',
    dotClass: 'bg-orange-400',
    badgeClass: 'text-orange-700 bg-orange-50 border-orange-200',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  waitlisted: {
    text: 'Waitlisted',
    dotClass: 'bg-amber-500',
    badgeClass: 'text-amber-700 bg-amber-50 border-amber-200',
    icon: <Clock className="h-3 w-3" />,
  },
  completed: {
    text: 'Completed',
    dotClass: 'bg-navy-400',
    badgeClass: 'text-navy-600 bg-navy-50 border-navy-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  no_show: {
    text: 'No Show',
    dotClass: 'bg-red-400',
    badgeClass: 'text-red-600 bg-red-50 border-red-200',
    icon: <XCircle className="h-3 w-3" />,
  },
};

const DEFAULT_STATUS = {
  text: 'Unknown',
  dotClass: 'bg-gray-400',
  badgeClass: 'text-gray-500 bg-gray-50 border-gray-200',
  icon: null,
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
  return <span className={cn('inline-block w-2 h-2 rounded-full', cfg.dotClass)} />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.badgeClass)}>
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

  // Determine which statuses are visible for the legend
  const visibleStatuses = new Set(bookedNights.map(n => n.status));

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
          List
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
          Calendar
        </button>
      </div>

      {viewMode === 'list' ? (
        /* List View */
        <div className="space-y-2">
          {bookedNights.length === 0 ? (
            <div className="text-center py-8">
              <Moon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No booked nights for this week</p>
            </div>
          ) : (
            bookedNights.map((night, i) => {
              const dateObj = parseISO(night.date);
              return (
                <div key={`${night.date}-${i}`} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-navy-100 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-semibold text-navy-600 leading-none uppercase">
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
                  <StatusBadge status={night.status} />
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
                  'min-h-[80px] rounded-xl border p-1.5 text-center transition-colors',
                  !isOperating && 'bg-gray-50 border-gray-100',
                  isOperating && !hasBookings && 'border-gray-200 bg-white',
                  hasBookings && 'border-navy-200 bg-navy-50',
                  isToday && 'ring-2 ring-accent-500 ring-offset-1'
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
                  <span className="text-[10px] text-gray-400">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend — only shown if there are bookings */}
      {bookedNights.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
          {Array.from(visibleStatuses).map(status => {
            const cfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
            return (
              <div key={status} className="flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-full', cfg.dotClass)} />
                <span>{cfg.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
