import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-ssr';
import { AdminSidebar } from '@/components/admin-sidebar';
import { AdminHeader } from '@/components/admin-header';
import { AdminRoleProvider } from '@/lib/admin-role-context';
import {
  getActiveCenterId,
  requireCenterRole,
  ALL_ADMIN_ROLES,
} from '@/lib/role-helpers';

/**
 * Server-side auth gate for all /admin/* routes.
 * Validates:
 * 1. User is authenticated (JWT verification)
 * 2. User has an active center membership with any admin-panel role
 *
 * Passes the user's role to client components via AdminRoleProvider.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  const centerId = await getActiveCenterId();
  if (!centerId) {
    redirect('/dashboard');
  }

  const membership = await requireCenterRole(user.id, centerId, [...ALL_ADMIN_ROLES]);
  if (!membership) {
    redirect('/dashboard');
  }

  return (
    <AdminRoleProvider role={membership.role} centerId={centerId}>
      <div className="flex min-h-screen bg-gray-50">
        <AdminSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <AdminHeader />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </AdminRoleProvider>
  );
}
