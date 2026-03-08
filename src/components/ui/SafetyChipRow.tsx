'use client';

import { CheckCircle, Phone, UserCheck, AlertTriangle, Heart, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SafetyChip {
  label: string;
  ready: boolean;
  icon: React.ReactNode;
}

interface Props {
  emergencyContactsCount: number;
  authorizedPickupsCount: number;
  hasMedicalProfile: boolean;
  hasAllergyInfo: boolean;
  hasCareNotes?: boolean;
  maxVisible?: number;
}

export function SafetyChipRow({
  emergencyContactsCount,
  authorizedPickupsCount,
  hasMedicalProfile,
  hasAllergyInfo,
  hasCareNotes = false,
  maxVisible = 4,
}: Props) {
  const chips: SafetyChip[] = [
    {
      label: emergencyContactsCount >= 1 ? 'Emergency contacts on file' : 'Add emergency contact',
      ready: emergencyContactsCount >= 1,
      icon: <Phone className="h-3 w-3" />,
    },
    {
      label: authorizedPickupsCount >= 1 ? 'Pickup verified' : 'Add authorized pickup',
      ready: authorizedPickupsCount >= 1,
      icon: <UserCheck className="h-3 w-3" />,
    },
    {
      label: hasAllergyInfo || hasMedicalProfile ? 'Medical info saved' : 'Add medical info',
      ready: hasAllergyInfo || hasMedicalProfile,
      icon: <Heart className="h-3 w-3" />,
    },
    {
      label: hasCareNotes ? 'Care notes added' : 'Add care notes',
      ready: hasCareNotes,
      icon: <FileText className="h-3 w-3" />,
    },
  ];

  const allReady = chips.every(c => c.ready);
  const visibleChips = chips.slice(0, maxVisible);
  const hiddenCount = chips.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1.5">
      {allReady && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
          <CheckCircle className="h-3 w-3" />
          Profile complete
        </span>
      )}
      {!allReady && visibleChips.map((chip, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border',
            chip.ready
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-amber-50 text-amber-700 border-amber-200',
          )}
        >
          {chip.ready ? <CheckCircle className="h-3 w-3" /> : chip.icon}
          {chip.label}
        </span>
      ))}
      {!allReady && hiddenCount > 0 && (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs text-gray-500">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
}
