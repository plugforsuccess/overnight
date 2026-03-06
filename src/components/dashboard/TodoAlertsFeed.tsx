'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DashboardChild } from '@/types/dashboard';

interface Props {
  childrenList: DashboardChild[];
}

interface TodoItem {
  id: string;
  severity: 'warning' | 'success';
  message: string;
  childName: string;
  href: string;
}

export function TodoAlertsFeed({ childrenList }: Props) {
  const todos: TodoItem[] = [];

  for (const child of childrenList) {
    const name = `${child.first_name} ${child.last_name}`;

    // Missing emergency contact
    if (child.emergency_contacts_count === 0) {
      todos.push({
        id: `${child.id}-no-ec`,
        severity: 'warning',
        message: 'Missing emergency contact',
        childName: name,
        href: '/dashboard/children',
      });
    }

    // Missing authorized pickup
    if (child.authorized_pickups_count === 0) {
      todos.push({
        id: `${child.id}-no-ap`,
        severity: 'warning',
        message: 'Missing authorized pickup',
        childName: name,
        href: '/dashboard/children',
      });
    }

    // Severe allergy missing treatment
    for (const allergy of child.allergies) {
      if (allergy.severity === 'SEVERE' && !allergy.has_treatment) {
        todos.push({
          id: `${child.id}-allergy-${allergy.id}`,
          severity: 'warning',
          message: `Missing emergency treatment for ${allergy.display_name} allergy`,
          childName: name,
          href: '/dashboard/children',
        });
      }
    }

    // Profile complete
    const isComplete = child.emergency_contacts_count >= 1 &&
      child.authorized_pickups_count >= 1 &&
      !child.allergies.some(a => a.severity === 'SEVERE' && !a.has_treatment);

    if (isComplete && child.emergency_contacts_count > 0) {
      todos.push({
        id: `${child.id}-complete`,
        severity: 'success',
        message: 'Profile complete',
        childName: name,
        href: '/dashboard/children',
      });
    }
  }

  if (todos.length === 0) {
    return null;
  }

  const warnings = todos.filter(t => t.severity === 'warning');
  const successes = todos.filter(t => t.severity === 'success');

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">To Do</h3>
      <div className="space-y-2">
        {warnings.map(todo => (
          <Link
            key={todo.id}
            href={todo.href}
            className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-100 hover:border-yellow-200 transition-colors"
          >
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">{todo.message}</p>
              <p className="text-xs text-yellow-600">{todo.childName}</p>
            </div>
          </Link>
        ))}
        {successes.map(todo => (
          <div
            key={todo.id}
            className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-100"
          >
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">{todo.message}</p>
              <p className="text-xs text-green-600">{todo.childName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
