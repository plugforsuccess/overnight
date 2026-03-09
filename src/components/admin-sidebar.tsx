'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Moon,
  TrendingUp,
  BarChart3,
  Ban,
  Activity,
  Calendar,
  List,
  Clock,
  ShieldCheck,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, section: 'overview' },
  { href: '/admin/tonight', label: 'Tonight', icon: Moon, section: 'operations' },
  { href: '/admin/waitlist-ops', label: 'Waitlist Queue', icon: TrendingUp, section: 'operations' },
  { href: '/admin/capacity', label: 'Capacity', icon: BarChart3, section: 'operations' },
  { href: '/admin/closures', label: 'Closures', icon: Ban, section: 'operations' },
  { href: '/admin/health', label: 'System Health', icon: Activity, section: 'operations' },
  { href: '/admin/safety', label: 'Safety', icon: ShieldAlert, section: 'operations' },
  { href: '/admin/incidents', label: 'Incidents', icon: AlertTriangle, section: 'operations' },
  { href: '/admin/revenue', label: 'Revenue', icon: DollarSign, section: 'operations' },
  { href: '/admin/ops', label: 'Ops Health', icon: Activity, section: 'operations' },
  { href: '/admin/roster', label: 'Roster', icon: Calendar, section: 'management' },
  { href: '/admin/plans', label: 'Plans', icon: List, section: 'management' },
  { href: '/admin/waitlist', label: 'Waitlist', icon: Clock, section: 'management' },
  { href: '/admin/pickup-verification', label: 'Pickup PIN', icon: ShieldCheck, section: 'management' },
];

const SECTION_LABELS: Record<string, string> = {
  overview: '',
  operations: 'Operations',
  management: 'Management',
};

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  let lastSection = '';

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-56'
      } bg-white border-r border-gray-200 flex flex-col transition-all duration-200 shrink-0 hidden lg:flex`}
    >
      <div className="flex items-center justify-between h-16 px-3 border-b border-gray-200">
        {!collapsed && (
          <span className="text-sm font-bold text-navy-800 truncate">Admin</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-gray-100 text-gray-400"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const showSection = item.section !== lastSection && item.section && SECTION_LABELS[item.section];
          if (item.section) lastSection = item.section;
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <div key={item.href}>
              {showSection && !collapsed && (
                <div className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {SECTION_LABELS[item.section!]}
                </div>
              )}
              {showSection && collapsed && <div className="my-2 mx-2 border-t border-gray-100" />}
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-navy-50 text-navy-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${active ? 'text-navy-600' : 'text-gray-400'}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
