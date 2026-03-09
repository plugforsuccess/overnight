import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Verify the request comes from an admin user.
 * Returns the user object if admin, null otherwise.
 */
export async function checkAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, role, is_admin')
    .eq('id', user.id)
    .single();

  if (!parent || (parent.role !== 'admin' && !parent.is_admin)) return null;
  return user;
}
