import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * The cookie name used by the browser client's custom storage adapter.
 * Must match the `storageKey` in supabase-client.ts.
 */
const STORAGE_KEY = 'sb-auth-token';

/**
 * Parse the auth cookie value into an access token.
 */
function parseAccessToken(cookieValue: string | undefined): string | undefined {
  if (!cookieValue) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue));
    return parsed.access_token;
  } catch {
    return undefined;
  }
}

/**
 * Server client for use in server components & route handlers.
 * Reads the auth cookie set by the browser client and injects it as the session.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const accessToken = parseAccessToken(cookieStore.get(STORAGE_KEY)?.value);

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {},
  );
}
