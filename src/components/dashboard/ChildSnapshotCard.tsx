'use client';

import Link from 'next/link';
import { AlertTriangle, Shield, Phone } from 'lucide-react';
import type { DashboardChild } from '@/types/dashboard';

interface Props {
  child: DashboardChild;
}

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
    return `${months}mo`;
  }
  return `${years}y`;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function ChildSnapshotCard({ child }: Props) {
  const age = getAge(child.date_of_birth);
  const initials = getInitials(child.first_name, child.last_name);
  const profileCompletion = computeProfileCompletion(child);

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="h-14 w-14 rounded-full bg-navy-100 text-navy-700 flex items-center justify-center text-lg font-bold flex-shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name and age */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {child.first_name} {child.last_name}
            </h3>
            <span className="text-sm text-gray-500">{age}</span>
          </div>

          <p className="text-xs text-gray-500 mb-3">DOB: {new Date(child.date_of_birth).toLocaleDateString()}</p>

          {/* Allergy badges */}
          {child.allergies.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {child.allergies.map(a => (
                <span
                  key={a.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    a.severity === 'SEVERE'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {a.display_name}
                </span>
              ))}
            </div>
          )}

          {/* Safety counts */}
          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {child.emergency_contacts_count} emergency contact{child.emergency_contacts_count !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              {child.authorized_pickups_count} authorized pickup{child.authorized_pickups_count !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Profile completion meter */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Profile completion</span>
              <span className={`font-medium ${profileCompletion === 100 ? 'text-green-600' : 'text-gray-700'}`}>
                {profileCompletion}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  profileCompletion === 100
                    ? 'bg-green-500'
                    : profileCompletion >= 60
                    ? 'bg-yellow-500'
                    : 'bg-red-400'
                }`}
                style={{ width: `${profileCompletion}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <Link
        href="/dashboard/children"
        className="block mt-2 text-center text-sm font-medium text-accent-600 hover:text-accent-700 py-2 rounded-lg hover:bg-accent-50 transition-colors"
      >
        Edit child profile
      </Link>
    </div>
  );
}

function computeProfileCompletion(child: DashboardChild): number {
  let score = 0;
  const total = 5;

  // Has name
  if (child.first_name && child.last_name) score++;
  // Has DOB
  if (child.date_of_birth) score++;
  // Has at least 1 emergency contact
  if (child.emergency_contacts_count >= 1) score++;
  // Has at least 1 authorized pickup
  if (child.authorized_pickups_count >= 1) score++;
  // Allergies documented (either has allergies listed OR has medical notes)
  if (child.allergies.length > 0 || child.has_medical_notes) score++;

  return Math.round((score / total) * 100);
}
