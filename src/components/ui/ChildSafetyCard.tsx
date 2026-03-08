'use client';

import Link from 'next/link';
import { AlertTriangle, Shield, Phone, CheckCircle, Heart, UserCheck, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PickupContact } from '@/components/ui/AuthorizedPickupsPanel';

export interface ChildSafetyInfo {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  allergies: { id: string; display_name: string; severity: string }[];
  emergency_contacts_count: number;
  authorized_pickups_count: number;
  has_medical_profile: boolean;
  has_medical_notes: boolean;
}

type CompletenessState = 'complete' | 'warning' | 'incomplete';

function getAge(dob: string): string {
  const birthDate = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    years--;
  }
  if (years < 1) {
    const months = (now.getFullYear() - birthDate.getFullYear()) * 12 + now.getMonth() - birthDate.getMonth();
    return `${months} mo`;
  }
  return `Age ${years}`;
}

function getInitials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function getCompletenessState(child: ChildSafetyInfo): CompletenessState {
  const hasName = !!(child.first_name && child.last_name);
  const hasDOB = !!child.date_of_birth;
  const hasEmergency = child.emergency_contacts_count >= 1;
  const hasPickup = child.authorized_pickups_count >= 1;
  const hasMedical = child.has_medical_profile || child.has_medical_notes || child.allergies.length > 0;

  if (hasName && hasDOB && hasEmergency && hasPickup && hasMedical) return 'complete';
  if (hasName && hasDOB && (hasEmergency || hasPickup)) return 'warning';
  return 'incomplete';
}

const COMPLETENESS_CONFIG: Record<CompletenessState, { label: string; badgeClass: string; icon: React.ReactNode }> = {
  complete: {
    label: 'Profile complete',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  warning: {
    label: 'Needs attention',
    badgeClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  incomplete: {
    label: 'Missing required info',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

interface Props {
  child: ChildSafetyInfo;
  compact?: boolean;
  showEditLink?: boolean;
  authorizedPickups?: PickupContact[];
}

export function ChildSafetyCard({ child, compact = false, showEditLink = true, authorizedPickups }: Props) {
  const age = getAge(child.date_of_birth);
  const initials = getInitials(child.first_name, child.last_name);
  const state = getCompletenessState(child);
  const cfg = COMPLETENESS_CONFIG[state];
  const hasSevere = child.allergies.some(a => a.severity === 'SEVERE');

  return (
    <div className={cn(
      'rounded-2xl border bg-white shadow-soft-sm',
      compact ? 'p-3' : 'p-4',
    )}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn(
          'rounded-full bg-navy-100 text-navy-700 flex items-center justify-center font-bold flex-shrink-0',
          compact ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base',
        )}>
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + age + completeness badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={cn(
              'font-semibold text-gray-900 truncate',
              compact ? 'text-sm' : 'text-base',
            )}>
              {child.first_name} {child.last_name}
            </h4>
            <span className="text-xs text-gray-500">{age}</span>
          </div>

          <span className={cn(
            'inline-flex items-center gap-1 rounded-full text-xs font-medium border mt-1',
            compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5',
            cfg.badgeClass,
          )}>
            {cfg.icon}
            {cfg.label}
          </span>

          {/* Allergy indicator */}
          {child.allergies.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {child.allergies.slice(0, compact ? 2 : 4).map(a => (
                <span
                  key={a.id}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border',
                    a.severity === 'SEVERE'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-yellow-50 text-yellow-700 border-yellow-200',
                  )}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {a.display_name}
                </span>
              ))}
              {child.allergies.length > (compact ? 2 : 4) && (
                <span className="text-xs text-gray-500">+{child.allergies.length - (compact ? 2 : 4)} more</span>
              )}
            </div>
          )}

          {/* Safety counts row */}
          {!compact && (
            <div className="flex items-center gap-3 mt-2.5 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-gray-400" />
                {child.emergency_contacts_count} emergency contact{child.emergency_contacts_count !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-gray-400" />
                {child.authorized_pickups_count} pickup{child.authorized_pickups_count !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {compact && (
            <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
              <span>{child.emergency_contacts_count} contacts</span>
              <span>&middot;</span>
              <span>{child.authorized_pickups_count} pickups</span>
            </div>
          )}

          {/* Authorized pickups inline (expanded view only) */}
          {!compact && authorizedPickups && authorizedPickups.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck className="h-3 w-3 text-green-600" />
                <span className="text-xs font-medium text-gray-600">Authorized pickups</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {authorizedPickups.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                  >
                    {p.first_name} {p.last_name}
                    <span className="text-green-500">&middot;</span>
                    <span className="text-green-600 font-normal">{p.relationship}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEditLink && (
        <Link
          href="/dashboard/children"
          className={cn(
            'block text-center text-sm font-medium text-accent-600 hover:text-accent-700 rounded-lg hover:bg-accent-50 transition-colors',
            compact ? 'mt-2 py-1.5' : 'mt-3 py-2',
          )}
        >
          {state === 'complete' ? 'View profile' : 'Complete profile'}
        </Link>
      )}
    </div>
  );
}
