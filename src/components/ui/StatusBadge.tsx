'use client';

import { CheckCircle, Clock, XCircle, AlertTriangle, Ban, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatusConfig {
  label: string;
  dotClass: string;
  badgeClass: string;
  icon: React.ReactNode;
}

/**
 * Canonical parent-facing status map.
 * Internal status names are mapped to friendly UI copy.
 */
export const STATUS_MAP: Record<string, StatusConfig> = {
  confirmed: {
    label: 'Confirmed',
    dotClass: 'bg-green-500',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  pending: {
    label: 'Pending approval',
    dotClass: 'bg-yellow-500',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: <Clock className="h-3 w-3" />,
  },
  pending_payment: {
    label: 'Pending approval',
    dotClass: 'bg-yellow-500',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: <Clock className="h-3 w-3" />,
  },
  waitlisted: {
    label: 'Waitlisted',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock className="h-3 w-3" />,
  },
  cancelled: {
    label: 'Cancelled',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-50 text-gray-500 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
  canceled: {
    label: 'Cancelled',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-50 text-gray-500 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
  canceled_low_enrollment: {
    label: 'Cancelled',
    dotClass: 'bg-gray-400',
    badgeClass: 'bg-gray-50 text-gray-500 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
  completed: {
    label: 'Completed',
    dotClass: 'bg-navy-400',
    badgeClass: 'bg-navy-50 text-navy-600 border-navy-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  no_show: {
    label: 'No-show',
    dotClass: 'bg-red-400',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
    icon: <Ban className="h-3 w-3" />,
  },
  locked: {
    label: 'Confirmed',
    dotClass: 'bg-green-500',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  full: {
    label: 'Full',
    dotClass: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
    icon: <Ban className="h-3 w-3" />,
  },
  closed: {
    label: 'Closed',
    dotClass: 'bg-gray-300',
    badgeClass: 'bg-gray-50 text-gray-400 border-gray-200',
    icon: <XCircle className="h-3 w-3" />,
  },
};

const DEFAULT_STATUS: StatusConfig = {
  label: 'Unknown',
  dotClass: 'bg-gray-400',
  badgeClass: 'bg-gray-50 text-gray-500 border-gray-200',
  icon: <Eye className="h-3 w-3" />,
};

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_MAP[status] || DEFAULT_STATUS;
}

export function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const cfg = getStatusConfig(status);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium border',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      cfg.badgeClass,
    )}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return <span className={cn('inline-block w-2 h-2 rounded-full', cfg.dotClass)} />;
}
