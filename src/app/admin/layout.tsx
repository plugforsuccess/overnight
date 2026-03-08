import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-ssr';
import { supabaseAdmin } from '@/lib/supabase-server';
import { AdminSidebar } from '@/components/admin-sidebar';

/**
 * Server-side auth gate for all /admin/* routes.
 * Validates:
 * 1. User is authenticated (JWT verification)
 * 2. User has admin role or is_admin flag
 *
 * Renders shared admin sidebar navigation.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, role, is_admin')
    .eq('id', user.id)
    .single();

  if (!parent || (parent.role !== 'admin' && !parent.is_admin)) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
