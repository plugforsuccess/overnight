import { createBrowserClient } from '@supabase/ssr';

/**
 * Singleton browser Supabase client.
 * Uses @supabase/ssr so auth tokens are stored in cookies (visible to
 * middleware and server components), not localStorage.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
