import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-ssr';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Server-side auth gate for all /dashboard/* routes.
 *
 * This runs on the server BEFORE any client component renders, so:
 * - No flash of unauthenticated content
 * - No client-side redirect race
 * - Auth is validated via JWT (getUser), not just cookie presence
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  console.log(`[dashboard/layout] server auth check: user=${user?.id ?? 'null'} error=${error?.message ?? 'none'}`);

  if (!user) {
    console.log('[dashboard/layout] No authenticated user — redirecting to /login');
    redirect('/login?redirect=/dashboard');
  }

  // Verify parent profile exists
  const { data: parent, error: parentError } = await supabaseAdmin
    .from('parents')
    .select('id, role')
    .eq('id', user.id)
    .single();

  console.log(`[dashboard/layout] parent lookup: found=${!!parent} error=${parentError?.message ?? 'none'}`);

  if (!parent) {
    console.log('[dashboard/layout] No parent profile found — redirecting to /login');
    redirect('/login');
  }

  return <>{children}</>;
}
