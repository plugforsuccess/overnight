'use client';

import Link from 'next/link';
import { Moon, ArrowRight } from 'lucide-react';

interface Props {
  canReserve: boolean;
  childName?: string;
}

export function BookOvernightCTA({ canReserve, childName }: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-navy-700 via-navy-800 to-navy-900 p-6 shadow-soft-md">
      {/* Decorative stars */}
      <div className="absolute top-3 right-4 w-1.5 h-1.5 rounded-full bg-white/30" />
      <div className="absolute top-8 right-12 w-1 h-1 rounded-full bg-white/20" />
      <div className="absolute top-5 right-20 w-1.5 h-1.5 rounded-full bg-white/25" />
      <div className="absolute bottom-6 right-8 w-1 h-1 rounded-full bg-white/15" />

      <div className="relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Moon className="h-5 w-5 text-accent-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Book Overnight Care</h3>
            <p className="text-sm text-navy-300">Sun\u2013Thu, 9 PM \u2013 7 AM</p>
          </div>
        </div>

        <p className="text-sm text-navy-200 mb-4">
          Select nights on our calendar and we&apos;ll handle the rest. Safe, licensed overnight care for your little one.
        </p>

        {canReserve ? (
          <Link
            href="/schedule"
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold py-2.5 px-5 rounded-lg shadow-soft-sm hover:shadow-soft-md transition-all duration-150 hover:-translate-y-[1px]"
          >
            Book Overnight Care
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <div>
            <span className="inline-flex items-center gap-2 bg-white/10 text-white/60 font-semibold py-2.5 px-5 rounded-lg cursor-not-allowed">
              Book Overnight Care
              <ArrowRight className="h-4 w-4" />
            </span>
            {childName && (
              <p className="text-xs text-navy-300 mt-2">
                Complete {childName}&apos;s safety profile to book
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
