import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

/**
 * The cookie name used by the browser client's custom storage adapter.
 * Must match the `storageKey` in supabase-client.ts.
 */
const STORAGE_KEY = 'sb-auth-token';

/**
 * Middleware Supabase client that reads the auth cookie from the request.
 * Separated from supabase-ssr.ts because middleware runs in the Edge runtime
 * and cannot import `next/headers`.
 */
export function createSupabaseMiddlewareClient(req: NextRequest) {
  const tokenCookie = req.cookies.get(STORAGE_KEY)?.value;

  let accessToken: string | undefined;
  if (tokenCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(tokenCookie));
      accessToken = parsed.access_token;
    } catch {
      // Cookie is malformed — treat as unauthenticated
    }
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {},
  );
}
