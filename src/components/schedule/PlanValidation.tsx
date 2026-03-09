'use client';

import { AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanValidationProps {
  requiredNights: number;
  selectedCount: number;
}

export default function PlanValidation({ requiredNights, selectedCount }: PlanValidationProps) {
  const isValid = selectedCount === requiredNights;
  const remaining = requiredNights - selectedCount;

  if (isValid) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
        <CheckCircle className="h-4 w-4 flex-shrink-0" />
        <span>All {requiredNights} nights selected</span>
      </div>
    );
  }

  return (
    <div className={cn(
      'flex items-center gap-2 text-sm px-3 py-2 rounded-lg',
      selectedCount > requiredNights
        ? 'text-red-700 bg-red-50'
        : 'text-yellow-700 bg-yellow-50'
    )}>
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>
        {selectedCount > requiredNights
          ? `Too many nights selected. Your ${requiredNights}-night plan requires exactly ${requiredNights} nights.`
          : `Select ${remaining} more night${remaining > 1 ? 's' : ''}. Your ${requiredNights}-night plan requires ${requiredNights} nights total.`
        }
      </span>
    </div>
  );
}
