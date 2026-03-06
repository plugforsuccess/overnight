'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { Moon, Menu, X, User, LogOut, Users, CreditCard, Bell, HelpCircle, ChevronDown } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';
import { supabase } from '@/lib/supabase-client';

interface UserProfile {
  first_name: string;
  last_name: string;
  email: string;
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser(authUser);
        const { data } = await supabase
          .from('parents')
          .select('first_name, last_name, email')
          .eq('id', authUser.id)
          .single();
        if (data) setProfile(data);
      }
    }
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setMenuOpen(false);
    window.location.href = '/login';
  }

  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : '';

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

            {user && profile ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-accent-600 text-white flex items-center justify-center text-sm font-semibold">
                    {initials}
                  </div>
                  <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">
                    {profile.first_name}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-[#E2E8F0] py-1 z-50">
                    <div className="px-4 py-3 border-b border-[#E2E8F0]">
                      <p className="text-sm font-semibold text-gray-900">{profile.first_name} {profile.last_name}</p>
                      <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                    </div>
                    <Link
                      href="/dashboard"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <User className="h-4 w-4 text-gray-400" />
                      Profile
                    </Link>
                    <Link
                      href="/dashboard/children"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Users className="h-4 w-4 text-gray-400" />
                      Children
                    </Link>
                    <Link
                      href="/dashboard/payments"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <CreditCard className="h-4 w-4 text-gray-400" />
                      Billing
                    </Link>
                    <Link
                      href="/dashboard#notifications"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Bell className="h-4 w-4 text-gray-400" />
                      Notifications
                    </Link>
                    <Link
                      href="/policies"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <HelpCircle className="h-4 w-4 text-gray-400" />
                      Support
                    </Link>
                    <div className="border-t border-[#E2E8F0] mt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className="btn-primary text-sm">
                Login
              </Link>
            )}
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
            {user && profile ? (
              <>
                <div className="border-t border-[#E2E8F0] pt-2 mt-2">
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-8 w-8 rounded-full bg-accent-600 text-white flex items-center justify-center text-sm font-semibold">
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{profile.first_name} {profile.last_name}</p>
                      <p className="text-xs text-gray-500">{profile.email}</p>
                    </div>
                  </div>
                </div>
                <Link href="/dashboard/children" className="block py-2 text-gray-700 font-medium" onClick={() => setOpen(false)}>
                  Children
                </Link>
                <Link href="/dashboard/payments" className="block py-2 text-gray-700 font-medium" onClick={() => setOpen(false)}>
                  Billing
                </Link>
                <button
                  onClick={() => { setOpen(false); handleLogout(); }}
                  className="block py-2 text-red-600 font-semibold w-full text-left"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link href="/login" className="block py-2 text-accent-600 font-semibold" onClick={() => setOpen(false)}>
                Login
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
