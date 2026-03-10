'use client';

import Link from 'next/link';
import { CalendarDays, CheckCircle, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import type { DashboardUpcomingNight } from '@/types/dashboard';
import { cn } from '@/lib/utils';

interface Props {
  nights: DashboardUpcomingNight[];
}

const STATUS_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string; icon: React.ReactNode }> = {
  confirmed: {
    label: 'Confirmed',
    dotClass: 'bg-green-500',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  pending_payment: {
    label: 'Pending',
    dotClass: 'bg-yellow-500',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: <Clock className="h-3 w-3" />,
  },
  waitlisted: {
    label: 'Waitlisted',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-50 text-gray-500 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
};

function groupByWeek(nights: DashboardUpcomingNight[]) {
  const groups: Map<string, DashboardUpcomingNight[]> = new Map();
  for (const night of nights) {
    const weekStart = startOfWeek(parseISO(night.date), { weekStartsOn: 0 });
    const key = format(weekStart, 'yyyy-MM-dd');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(night);
  }
  return groups;
}

export function UpcomingWeekCard({ nights }: Props) {
  if (nights.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-navy-50 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-navy-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Nights</h3>
        </div>
        <div className="text-center py-8">
          <CalendarDays className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No upcoming nights booked</p>
          <Link href="/schedule" className="inline-block mt-3 text-sm font-medium text-accent-600 hover:text-accent-700">
            Book overnight care
          </Link>
        </div>
      </div>
    );
  }

  const weekGroups = groupByWeek(nights);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-navy-50 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-navy-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Nights</h3>
            <p className="text-xs text-gray-500">{nights.length} night{nights.length !== 1 ? 's' : ''} scheduled</p>
          </div>
        </div>
        <Link
          href="/dashboard/reservations"
          className="text-sm font-medium text-accent-600 hover:text-accent-700"
        >
          View all
        </Link>
      </div>

      <div className="space-y-4">
        {Array.from(weekGroups.entries()).map(([weekKey, weekNights]) => {
          const weekStart = parseISO(weekKey);
          const weekEnd = addDays(weekStart, 6);
          const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d')}`;

          return (
            <div key={weekKey}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Week of {weekLabel}
              </div>
              <div className="space-y-1.5">
                {weekNights.map((night: DashboardUpcomingNight) => {
                  const dateObj = parseISO(night.date);
                  const cfg = STATUS_CONFIG[night.status] || STATUS_CONFIG.confirmed;

                  return (
                    <div
                      key={night.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-navy-100 flex flex-col items-center justify-center flex-shrink-0">
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
                            {night.child_first_name} {night.child_last_name}
                          </div>
                        </div>
                      </div>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                        cfg.badgeClass
                      )}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
