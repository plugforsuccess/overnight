'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Moon, LogOut, ChevronDown, ExternalLink,
} from 'lucide-react';
import { APP_NAME } from '@/lib/constants';
import { supabase } from '@/lib/supabase-client';

interface UserProfile {
  first_name: string;
  last_name: string;
  email: string;
}

export function AdminHeader() {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('parents')
      .select('first_name, last_name, email')
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
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between h-14 px-4 sm:px-6">
        {/* Left: branding */}
        <div className="flex items-center gap-2">
          <Moon className="h-5 w-5 text-accent-500" />
          <span className="text-lg font-bold text-navy-800">{APP_NAME}</span>
          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-1">
            Admin
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Parent App
          </Link>

          {profile && user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-accent-600 text-white flex items-center justify-center text-sm font-semibold">
                  {initials}
                </div>
                <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate hidden sm:block">
                  {profile.first_name}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-sm font-semibold text-gray-900">{profile.first_name} {profile.last_name}</p>
                    <p className="text-xs text-gray-500 truncate">{profile.email}</p>
                  </div>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors sm:hidden"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                    View Parent App
                  </Link>
                  <div className="border-t border-gray-200 sm:border-t-0">
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
            <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}
