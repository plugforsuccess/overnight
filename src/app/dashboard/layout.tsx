import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-ssr';
import { supabaseAdmin } from '@/lib/supabase-server';
import { AppShell, SidebarNav } from '@/components/ui/system';

const parentNav = [
  { href: '/dashboard', label: 'Tonight' },
  { href: '/dashboard/children', label: 'Children' },
  { href: '/dashboard/reservations', label: 'Reservations' },
  { href: '/dashboard/payments', label: 'Payments' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/dashboard');

  const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('id', user.id).single();
  if (!parent) redirect('/login');

  return <AppShell sidebar={<SidebarNav title="Parent Home" items={parentNav} />} topbarTitle="Family Dashboard">{children}</AppShell>;
}
