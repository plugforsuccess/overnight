'use client';

import Link from 'next/link';
import { Moon, Clock, CheckCircle } from 'lucide-react';
import { format, parseISO, differenceInDays, isToday, isTomorrow } from 'date-fns';

interface NextReservation {
  id: string;
  date: string;
  status: string;
  child_first_name: string;
  child_last_name: string;
}

interface Props {
  reservation: NextReservation | null;
}

const STATUS_STYLES: Record<string, { class: string; label: string; icon: React.ReactNode }> = {
  confirmed: {
    class: 'bg-green-50 text-green-700 border border-green-200',
    label: 'Confirmed',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  pending_payment: {
    class: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    label: 'Pending',
    icon: <Clock className="h-3 w-3" />,
  },
  waitlisted: {
    class: 'bg-amber-50 text-amber-700 border border-amber-200',
    label: 'Waitlisted',
    icon: <Clock className="h-3 w-3" />,
  },
};

function getCountdownLabel(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Tonight';
  if (isTomorrow(date)) return 'Tomorrow night';
  const days = differenceInDays(date, new Date());
  if (days <= 7) return `In ${days} days`;
  return format(date, 'EEEE, MMM d');
}

export function NextReservationCard({ reservation }: Props) {
  if (!reservation) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-navy-50 flex items-center justify-center">
            <Moon className="h-5 w-5 text-navy-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Next Overnight</h3>
        </div>
        <div className="text-center py-6">
          <Moon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No upcoming overnights</p>
          <Link href="/schedule" className="inline-block mt-3 text-sm font-medium text-accent-600 hover:text-accent-700">
            Book overnight care
          </Link>
        </div>
      </div>
    );
  }

  const dateObj = parseISO(reservation.date);
  const countdownLabel = getCountdownLabel(reservation.date);
  const statusStyle = STATUS_STYLES[reservation.status] || STATUS_STYLES.confirmed;
  const isImminent = isToday(dateObj) || isTomorrow(dateObj);

  return (
    <div className={`card ${isImminent ? 'border-l-4 border-l-accent-500' : ''}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-navy-50 flex items-center justify-center">
          <Moon className="h-5 w-5 text-navy-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Next Overnight</h3>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.class}`}>
            {statusStyle.icon}
            {statusStyle.label}
          </span>
        </div>
      </div>

      <div className="bg-navy-50 rounded-xl p-4">
        <div className="text-2xl font-bold text-navy-900 mb-1">
          {countdownLabel}
        </div>
        <div className="text-sm text-navy-600">
          {format(dateObj, 'EEEE, MMMM d, yyyy')}
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm text-navy-500">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            9:00 PM &ndash; 7:00 AM
          </span>
          <span>
            {reservation.child_first_name} {reservation.child_last_name}
          </span>
        </div>
      </div>

      <Link
        href="/dashboard/reservations"
        className="block mt-3 text-center text-sm font-medium text-accent-600 hover:text-accent-700 py-2 rounded-lg hover:bg-accent-50 transition-colors"
      >
        Manage reservation
      </Link>
    </div>
  );
}
