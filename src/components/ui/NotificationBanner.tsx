'use client';

import { useState } from 'react';
import { X, Bell, CheckCircle, ArrowUpCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NotificationType = 'reminder' | 'confirmation' | 'promotion' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  dismissible?: boolean;
}

const TYPE_CONFIG: Record<NotificationType, {
  icon: React.ReactNode;
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconClass: string;
}> = {
  reminder: {
    icon: <Bell className="h-4 w-4" />,
    bgClass: 'bg-navy-50',
    borderClass: 'border-navy-200',
    textClass: 'text-navy-800',
    iconClass: 'text-navy-600',
  },
  confirmation: {
    icon: <CheckCircle className="h-4 w-4" />,
    bgClass: 'bg-green-50',
    borderClass: 'border-green-200',
    textClass: 'text-green-800',
    iconClass: 'text-green-600',
  },
  promotion: {
    icon: <ArrowUpCircle className="h-4 w-4" />,
    bgClass: 'bg-green-50',
    borderClass: 'border-green-200',
    textClass: 'text-green-800',
    iconClass: 'text-green-600',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-800',
    iconClass: 'text-amber-600',
  },
};

interface BannerProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

function SingleBanner({ notification, onDismiss }: BannerProps) {
  const cfg = TYPE_CONFIG[notification.type];
  const dismissible = notification.dismissible !== false;

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 flex items-start gap-3 transition-all',
      cfg.bgClass,
      cfg.borderClass,
    )}>
      <div className={cn('mt-0.5 flex-shrink-0', cfg.iconClass)}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', cfg.textClass)}>
          {notification.title}
        </div>
        <p className={cn('text-sm mt-0.5', cfg.textClass, 'opacity-80')}>
          {notification.message}
        </p>
        {notification.actionLabel && notification.actionHref && (
          <a
            href={notification.actionHref}
            className={cn('inline-block text-sm font-medium mt-1.5 underline hover:no-underline', cfg.textClass)}
          >
            {notification.actionLabel}
          </a>
        )}
      </div>
      {dismissible && (
        <button
          onClick={() => onDismiss(notification.id)}
          className={cn(
            'p-1 rounded-lg transition-colors flex-shrink-0',
            cfg.textClass,
            'opacity-50 hover:opacity-100',
          )}
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface Props {
  notifications: Notification[];
}

export function NotificationBannerStack({ notifications: initialNotifications }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = initialNotifications.filter(n => !dismissed.has(n.id));

  if (visible.length === 0) return null;

  function handleDismiss(id: string) {
    setDismissed((prev: Set<string>) => new Set(prev).add(id));
  }

  return (
    <div className="space-y-2">
      {visible.map(notification => (
        <SingleBanner
          key={notification.id}
          notification={notification}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
}
