import { createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client with cookie-based storage.
 *
 * Uses `@supabase/supabase-js` directly with a custom `storage` adapter
 * that persists auth tokens in document.cookie instead of localStorage.
 * This allows the middleware and server components to read the session.
 *
 * We avoid importing `@supabase/ssr` because it may not be installed
 * in all deployment environments.
 */

const COOKIE_OPTIONS = 'path=/; max-age=31536000; SameSite=Lax';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; ${COOKIE_OPTIONS}`;
}

function removeCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

const STORAGE_KEY = 'sb-auth-token';

const cookieStorage = {
  getItem(key: string): string | null {
    return getCookie(key);
  },
  setItem(key: string, value: string): void {
    setCookie(key, value);
  },
  removeItem(key: string): void {
    removeCookie(key);
  },
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: cookieStorage,
      storageKey: STORAGE_KEY,
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
