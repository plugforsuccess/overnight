'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { formatCents } from '@/lib/constants';
import { format, nextFriday } from 'date-fns';

interface Subscription {
  id: string;
  plan_tier: string;
  status: string;
  next_billing_date: string | null;
}

interface Props {
  subscriptions: Subscription[];
  weeklyTotalCents: number;
  stripeCustomerId: string | null;
}

export function BillingSummaryCard({ subscriptions, weeklyTotalCents, stripeCustomerId }: Props) {
  const activeSubscription = subscriptions.find(s => s.status === 'active');
  const nextBilling = nextFriday(new Date());

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <CreditCard className="h-6 w-6 text-navy-700" />
        <h3 className="text-lg font-semibold text-gray-900">Billing & Plan</h3>
      </div>

      <div className="space-y-4">
        {/* Active plan */}
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-500">Active Plan</p>
            <p className="font-semibold text-gray-900">
              {activeSubscription
                ? `${activeSubscription.plan_tier.charAt(0).toUpperCase() + activeSubscription.plan_tier.slice(1)}`
                : 'No active plan'}
            </p>
          </div>
          {activeSubscription && (
            <span className="badge-green">{activeSubscription.status}</span>
          )}
        </div>

        {/* Next billing */}
        {activeSubscription && (
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Next Billing</p>
              <p className="font-medium text-gray-900">{format(nextBilling, 'MMM d, yyyy')}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Weekly Total</p>
              <p className="font-bold text-gray-900">{formatCents(weeklyTotalCents)}</p>
            </div>
          </div>
        )}

        {/* Payment method */}
        <div className="flex justify-between items-center pt-3 border-t border-[#E2E8F0]">
          <div>
            <p className="text-sm text-gray-500">Payment Method</p>
            <p className="text-sm font-medium text-gray-900">
              {stripeCustomerId ? '•••• on file' : 'Not set up'}
            </p>
          </div>
          <Link
            href="/dashboard/payments"
            className="text-sm font-medium text-accent-600 hover:text-accent-700"
          >
            {stripeCustomerId ? 'Update' : 'Add payment'}
          </Link>
        </div>
      </div>

      <Link
        href="/dashboard/payments"
        className="block mt-4 text-center text-sm font-medium text-accent-600 hover:text-accent-700 py-2 rounded-lg hover:bg-accent-50 transition-colors"
      >
        Payment history
      </Link>
    </div>
  );
}
