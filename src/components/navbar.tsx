'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Moon, Menu, X } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-white border-b border-[#E2E8F0] sticky top-0 z-50 shadow-soft-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="flex items-center gap-2">
            <Moon className="h-7 w-7 text-accent-500" />
            <span className="text-xl font-bold text-navy-800">{APP_NAME}</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/pricing" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
              Pricing
            </Link>
            <Link href="/schedule" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
              Reserve Nights
            </Link>
            <Link href="/policies" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
              Policies & FAQ
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
              Dashboard
            </Link>
            <Link href="/login" className="btn-primary text-sm">
              Login
            </Link>
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white">
          <div className="px-4 py-3 space-y-2">
            <Link href="/pricing" className="block py-2 text-gray-700 font-medium" onClick={() => setOpen(false)}>
              Pricing
            </Link>
            <Link href="/schedule" className="block py-2 text-gray-700 font-medium" onClick={() => setOpen(false)}>
              Reserve Nights
            </Link>
            <Link href="/policies" className="block py-2 text-gray-700 font-medium" onClick={() => setOpen(false)}>
              Policies & FAQ
            </Link>
            <Link href="/dashboard" className="block py-2 text-gray-700 font-medium" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
            <Link href="/login" className="block py-2 text-accent-600 font-semibold" onClick={() => setOpen(false)}>
              Login
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
