'use client';

import { Calendar, CheckCircle, Clock, XCircle, ArrowUpCircle, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface TimelineEvent {
  id: string;
  event_type: string;
  event_data: Record<string, any>;
  created_at: string;
}

interface Props {
  events: TimelineEvent[];
}

const EVENT_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  dotClass: string;
}> = {
  reservation_created: {
    label: 'Booked',
    icon: <Calendar className="h-3.5 w-3.5" />,
    dotClass: 'bg-navy-500',
  },
  reservation_confirmed: {
    label: 'Confirmed',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    dotClass: 'bg-green-500',
  },
  reservation_cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="h-3.5 w-3.5" />,
    dotClass: 'bg-gray-400',
  },
  night_status_changed: {
    label: 'Status updated',
    icon: <Clock className="h-3.5 w-3.5" />,
    dotClass: 'bg-yellow-500',
  },
  night_waitlisted: {
    label: 'Waitlisted',
    icon: <Clock className="h-3.5 w-3.5" />,
    dotClass: 'bg-amber-500',
  },
  night_promoted: {
    label: 'Promoted from waitlist',
    icon: <ArrowUpCircle className="h-3.5 w-3.5" />,
    dotClass: 'bg-green-500',
  },
  night_completed: {
    label: 'Stay completed',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    dotClass: 'bg-navy-400',
  },
  night_no_show: {
    label: 'Marked as no-show',
    icon: <Ban className="h-3.5 w-3.5" />,
    dotClass: 'bg-red-400',
  },
};

const DEFAULT_EVENT = {
  label: 'Update',
  icon: <Clock className="h-3.5 w-3.5" />,
  dotClass: 'bg-gray-400',
};

function getEventLabel(event: TimelineEvent): string {
  const cfg = EVENT_CONFIG[event.event_type];
  if (cfg) return cfg.label;

  // Map internal event names to friendly copy
  const type = event.event_type;
  if (type.includes('cancel')) return 'Cancelled';
  if (type.includes('confirm')) return 'Confirmed';
  if (type.includes('promote')) return 'Promoted from waitlist';
  if (type.includes('waitlist')) return 'Waitlisted';
  if (type.includes('complete')) return 'Stay completed';
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getEventDescription(event: TimelineEvent): string | null {
  const data = event.event_data;
  if (!data) return null;

  if (data.care_date) {
    try {
      return format(parseISO(data.care_date), 'EEEE, MMM d');
    } catch { /* ignore */ }
  }
  if (data.from_status && data.to_status) {
    return `${data.from_status} \u2192 ${data.to_status}`;
  }
  return null;
}

export function ReservationTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-gray-500">
        No activity yet
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-[9px] top-3 bottom-3 w-px bg-gray-200" />

      <div className="space-y-4">
        {events.map((event, i) => {
          const cfg = EVENT_CONFIG[event.event_type] || DEFAULT_EVENT;
          const label = getEventLabel(event);
          const description = getEventDescription(event);
          const timestamp = format(parseISO(event.created_at), 'MMM d, h:mm a');

          return (
            <div key={event.id} className="flex gap-3 relative">
              {/* Dot */}
              <div className={cn(
                'w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-white text-white z-10',
                cfg.dotClass,
              )}>
                {/* tiny icon inside dot would be too small, just show colored dot */}
              </div>

              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{label}</span>
                  <span className="text-xs text-gray-400">{timestamp}</span>
                </div>
                {description && (
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
