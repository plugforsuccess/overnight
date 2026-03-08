'use client';

import Link from 'next/link';

interface Props {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyStateCard({ icon, title, description, actionLabel, actionHref, onAction }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-soft-sm">
      <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mx-auto mb-5">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-2 btn-primary text-sm px-5"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 btn-primary text-sm px-5"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
