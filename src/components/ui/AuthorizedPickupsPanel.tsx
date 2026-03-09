'use client';

import { useState } from 'react';
import { UserCheck, Phone, ShieldCheck, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickupContact {
  id: string;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string;
  is_emergency_contact: boolean;
  id_verified: boolean;
}

interface Props {
  pickups: PickupContact[];
  compact?: boolean;
  showEmptyState?: boolean;
  addPickupHref?: string;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export function AuthorizedPickupsPanel({
  pickups,
  compact = false,
  showEmptyState = true,
  addPickupHref = '/dashboard/children',
}: Props) {
  if (pickups.length === 0 && !showEmptyState) return null;

  if (pickups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/50 p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">No authorized pickups configured</p>
            <p className="text-xs text-amber-600 mt-0.5">
              For safety, please add at least one pickup contact.
            </p>
            <a
              href={addPickupHref}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600 hover:text-accent-700 mt-2"
            >
              Add Pickup Contact
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      'rounded-2xl border border-gray-200 bg-white shadow-soft-sm',
      compact ? 'p-3' : 'p-4',
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-navy-600" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Authorized Pickups
          </span>
        </div>
        {pickups.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <ShieldCheck className="h-3 w-3" />
            {pickups.length} verified
          </span>
        )}
      </div>

      <div className={cn('space-y-2', compact && 'space-y-1.5')}>
        {pickups.map(pickup => (
          <PickupRow key={pickup.id} pickup={pickup} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function PickupRow({ pickup, compact }: { pickup: PickupContact; compact: boolean }) {
  const [showPhone, setShowPhone] = useState(false);

  return (
    <div className={cn(
      'flex items-center justify-between rounded-xl border transition-colors',
      compact ? 'p-2' : 'p-3',
      'bg-gray-50 border-gray-100',
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          'rounded-full bg-navy-100 text-navy-700 flex items-center justify-center font-bold flex-shrink-0',
          compact ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm',
        )}>
          {pickup.first_name.charAt(0)}{pickup.last_name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              'font-medium text-gray-900 truncate',
              compact ? 'text-xs' : 'text-sm',
            )}>
              {pickup.first_name} {pickup.last_name}
            </span>
            <span className="text-xs text-gray-400">{pickup.relationship}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={() => setShowPhone(!showPhone)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              title={showPhone ? 'Hide phone' : 'Show phone'}
            >
              <Phone className="h-3 w-3" />
              {showPhone ? formatPhone(pickup.phone) : '\u2022\u2022\u2022\u2022' + pickup.phone.slice(-4)}
              {showPhone ? (
                <EyeOff className="h-3 w-3 ml-0.5 text-gray-400" />
              ) : (
                <Eye className="h-3 w-3 ml-0.5 text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {pickup.is_emergency_contact && (
          <span className={cn(
            'inline-flex items-center gap-0.5 rounded-full font-medium border',
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
            'bg-red-50 text-red-600 border-red-200',
          )}>
            Emergency
          </span>
        )}
        {pickup.id_verified && (
          <span className={cn(
            'inline-flex items-center gap-0.5 rounded-full font-medium border',
            compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
            'bg-green-50 text-green-700 border-green-200',
          )}>
            <ShieldCheck className="h-3 w-3" />
            ID verified
          </span>
        )}
      </div>
    </div>
  );
}
