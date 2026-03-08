'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Moon, Menu, X, LogOut, Users, ChevronDown,
  CalendarCheck, Settings, ShieldAlert,
} from 'lucide-react';
import { APP_NAME } from '@/lib/constants';
import { supabase } from '@/lib/supabase-client';

interface UserProfile {
  first_name: string;
  last_name: string;
  email: string;
  role?: string;
  is_admin?: boolean;
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('parents')
      .select('first_name, last_name, email, role, is_admin')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (authUser) {
        setUser(authUser);
        await loadProfile(authUser.id);
      }
      setAuthLoading(false);
    }
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
      setAuthLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

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

  const isAuthenticated = !!user && !!profile;
  const isAdmin = profile?.role === 'admin' || profile?.is_admin === true;

  const initials = profile
    ? `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`.toUpperCase()
    : '';

  // Skeleton placeholder while auth state resolves
  const authSkeleton = (
    <div className="flex items-center gap-2 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-gray-200" />
      <div className="h-4 w-16 rounded bg-gray-200 hidden sm:block" />
    </div>
  );

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
            {/* Auth-aware primary navigation */}
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Dashboard
                </Link>
                <Link href="/schedule" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Reserve Nights
                </Link>
                <Link href="/policies" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Policies &amp; FAQ
                </Link>
                <Link href="/dashboard/payments" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Billing
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="text-navy-700 hover:text-navy-900 font-semibold transition-colors flex items-center gap-1">
                    <ShieldAlert className="h-4 w-4" />
                    Admin
                  </Link>
                )}
              </>
            ) : !authLoading ? (
              <>
                <Link href="/pricing" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Pricing
                </Link>
                <Link href="/schedule" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Reserve Nights
                </Link>
                <Link href="/policies" className="text-gray-600 hover:text-navy-700 font-medium transition-colors">
                  Policies &amp; FAQ
                </Link>
              </>
            ) : null}

            {/* Auth-aware right section */}
            {authLoading ? (
              authSkeleton
            ) : isAuthenticated ? (
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
                      href="/dashboard/children"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Users className="h-4 w-4 text-gray-400" />
                      My Children
                    </Link>
                    <Link
                      href="/dashboard/reservations"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <CalendarCheck className="h-4 w-4 text-gray-400" />
                      Reservations
                    </Link>
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Settings className="h-4 w-4 text-gray-400" />
                      Profile / Settings
                    </Link>
                    {isAdmin && (
                      <Link
                        href="/admin"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-navy-700 hover:bg-navy-50 transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <ShieldAlert className="h-4 w-4 text-navy-500" />
                        Admin Panel
                      </Link>
                    )}
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
              <div className="flex items-center gap-3">
                <Link href="/login" className="text-gray-600 hover:text-navy-700 font-medium transition-colors text-sm">
                  Login
                </Link>
                <Link href="/signup" className="btn-primary text-sm">
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white">
          <div className="px-4 py-3 space-y-2">
            {authLoading ? (
              <div className="flex items-center gap-3 py-2 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-gray-200" />
                <div className="h-4 w-24 rounded bg-gray-200" />
              </div>
            ) : isAuthenticated ? (
              <>
                {/* Profile header */}
                <div className="flex items-center gap-3 py-2 border-b border-[#E2E8F0] pb-3 mb-1">
                  <div className="h-8 w-8 rounded-full bg-accent-600 text-white flex items-center justify-center text-sm font-semibold">
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{profile.first_name} {profile.last_name}</p>
                    <p className="text-xs text-gray-500">{profile.email}</p>
                  </div>
                </div>

                {/* Primary nav */}
                <Link href="/dashboard" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Dashboard
                </Link>
                <Link href="/schedule" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Reserve Nights
                </Link>
                <Link href="/policies" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Policies &amp; FAQ
                </Link>
                <Link href="/dashboard/payments" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Billing
                </Link>

                {/* Account links */}
                <div className="border-t border-[#E2E8F0] pt-2 mt-2 space-y-2">
                  <Link href="/dashboard/children" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                    My Children
                  </Link>
                  <Link href="/dashboard/reservations" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                    Reservations
                  </Link>
                  <Link href="/dashboard/settings" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                    Profile / Settings
                  </Link>
                </div>

                {/* Admin link */}
                {isAdmin && (
                  <div className="border-t border-[#E2E8F0] pt-2 mt-2">
                    <Link href="/admin" className="block py-2 text-navy-700 font-semibold" onClick={() => setMobileOpen(false)}>
                      Admin Panel
                    </Link>
                  </div>
                )}

                <div className="border-t border-[#E2E8F0] pt-2 mt-2">
                  <button
                    onClick={() => { setMobileOpen(false); handleLogout(); }}
                    className="block py-2 text-red-600 font-semibold w-full text-left"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link href="/pricing" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Pricing
                </Link>
                <Link href="/schedule" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Reserve Nights
                </Link>
                <Link href="/policies" className="block py-2 text-gray-700 font-medium" onClick={() => setMobileOpen(false)}>
                  Policies &amp; FAQ
                </Link>
                <div className="border-t border-[#E2E8F0] pt-2 mt-2 space-y-2">
                  <Link href="/login" className="block py-2 text-accent-600 font-semibold" onClick={() => setMobileOpen(false)}>
                    Login
                  </Link>
                  <Link href="/signup" className="block py-2 text-accent-600 font-semibold" onClick={() => setMobileOpen(false)}>
                    Get Started
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
