import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-ssr';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getProfileCompletion } from '@/lib/profile-completion';

/** Routes accessible even when profile has blockers */
const ALLOWED_WHILE_BLOCKED = [
  '/dashboard/complete-profile',
  '/dashboard/settings',
  '/dashboard/children',
  '/dashboard/payments',
];

/**
 * Server-side auth gate for all /dashboard/* routes.
 *
 * This runs on the server BEFORE any client component renders, so:
 * - No flash of unauthenticated content
 * - No client-side redirect race
 * - Auth is validated via JWT (getUser), not just cookie presence
 *
 * Also enforces profile completion gating:
 * - If Tier 1 blockers exist, redirect to /dashboard/complete-profile
 * - Exception routes (complete-profile, settings, children, payments) are allowed
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

  // Skip completion gating for admin users
  if (parent.role === 'admin') {
    return <>{children}</>;
  }

  // Profile completion gating
  const headersList = await headers();
  const url = headersList.get('x-url') || headersList.get('x-invoke-path') || '';
  // Extract pathname from various Next.js header formats
  const pathname = url.startsWith('http') ? new URL(url).pathname : url;

  // Determine current path — if we can't read it from headers, try referer
  const referer = headersList.get('referer') || '';
  const currentPath = pathname || (referer ? new URL(referer).pathname : '/dashboard');

  const isAllowedRoute = ALLOWED_WHILE_BLOCKED.some(route => currentPath.startsWith(route));

  if (!isAllowedRoute) {
    try {
      const completion = await getProfileCompletion(supabaseAdmin, user.id);

      if (completion.hasBlockingIssues) {
        console.log(`[dashboard/layout] Profile has blockers — redirecting to /dashboard/complete-profile (path=${currentPath})`);
        redirect('/dashboard/complete-profile');
      }
    } catch (err: any) {
      // Don't block dashboard access if completion check fails
      console.error(`[dashboard/layout] Profile completion check failed:`, err?.message);
    }
  }

  return <>{children}</>;
}
