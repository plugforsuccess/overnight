import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-ssr';
import { supabaseAdmin } from '@/lib/supabase-server';
import { AppShell, SidebarNav } from '@/components/ui/system';

const adminNav = [
  { href: '/admin/operations', label: 'Operations' },
  { href: '/admin/roster', label: 'Reservations / Roster' },
  { href: '/admin/incidents', label: 'Incidents' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/shift-roster', label: 'Shifts' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/waitlist', label: 'Waitlist' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?redirect=/admin');

  const { data: parent } = await supabaseAdmin.from('parents').select('id, role, is_admin').eq('id', user.id).single();
  if (!parent || (parent.role !== 'admin' && !parent.is_admin)) redirect('/dashboard');

  return <AppShell sidebar={<SidebarNav title="Facility Ops" items={adminNav} />} topbarTitle="Operations Center">{children}</AppShell>;
}
