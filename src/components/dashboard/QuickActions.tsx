'use client';

import Link from 'next/link';
import { Moon, Users, Phone, Shield } from 'lucide-react';

interface Props {
  hasChildren: boolean;
}

const actions = [
  {
    label: 'Book Overnight Care',
    href: '/schedule',
    icon: Moon,
    primary: true,
  },
  {
    label: 'Manage Children',
    href: '/dashboard/children',
    icon: Users,
    primary: false,
  },
  {
    label: 'Emergency Contacts',
    href: '/dashboard/children',
    icon: Phone,
    primary: false,
  },
  {
    label: 'Authorized Pickups',
    href: '/dashboard/children',
    icon: Shield,
    primary: false,
  },
];

export function QuickActions({ hasChildren }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map(action => (
        <Link
          key={action.label}
          href={action.href}
          className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:-translate-y-[1px] ${
            action.primary
              ? 'bg-accent-600 text-white border-accent-600 hover:bg-accent-700 shadow-soft-sm hover:shadow-soft-md'
              : 'bg-white text-gray-700 border-[#E2E8F0] hover:border-gray-300 hover:shadow-soft-sm'
          }`}
        >
          <action.icon className={`h-6 w-6 ${action.primary ? 'text-white' : 'text-navy-700'}`} />
          <span className={`text-sm font-medium text-center ${action.primary ? 'text-white' : 'text-gray-700'}`}>
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
