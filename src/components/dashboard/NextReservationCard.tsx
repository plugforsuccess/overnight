'use client';

import Link from 'next/link';
import { Calendar, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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

const STATUS_STYLES: Record<string, { class: string; label: string }> = {
  confirmed: { class: 'badge-green', label: 'Confirmed' },
  pending_payment: { class: 'badge-yellow', label: 'Pending Payment' },
  waitlist: { class: 'badge-blue', label: 'Waitlist' },
};

export function NextReservationCard({ reservation }: Props) {
  if (!reservation) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="h-6 w-6 text-navy-700" />
          <h3 className="text-lg font-semibold text-gray-900">Next Reservation</h3>
        </div>
        <div className="text-center py-6">
          <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No upcoming reservations</p>
          <Link href="/schedule" className="btn-primary text-sm">
            Reserve Nights
          </Link>
        </div>
      </div>
    );
  }

  const dateFormatted = format(parseISO(reservation.date), 'EEEE, MMMM d, yyyy');
  const statusStyle = STATUS_STYLES[reservation.status] || { class: 'badge-blue', label: reservation.status };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <Calendar className="h-6 w-6 text-navy-700" />
        <h3 className="text-lg font-semibold text-gray-900">Next Reservation</h3>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-semibold text-gray-900">{dateFormatted}</p>
            <p className="text-sm text-gray-500">
              {reservation.child_first_name} {reservation.child_last_name}
            </p>
          </div>
          <span className={statusStyle.class}>{statusStyle.label}</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <Clock className="h-3.5 w-3.5" />
          9:00 PM – 7:00 AM
        </div>
      </div>

      <Link
        href="/schedule"
        className="block mt-3 text-center text-sm font-medium text-accent-600 hover:text-accent-700 py-2 rounded-lg hover:bg-accent-50 transition-colors"
      >
        Manage reservation
      </Link>
    </div>
  );
}
