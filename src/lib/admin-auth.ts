import { NextRequest } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Create a Supabase client from the request's Authorization header.
 */
function getUserClient(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/**
 * Verify the request comes from an admin user.
 * Returns the user object if admin, null otherwise.
 *
 * Admin is defined as: parents.role = 'admin' OR parents.is_admin = true
 */
export async function checkAdmin(req: NextRequest): Promise<User | null> {
  const supabase = getUserClient(req);
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

/**
 * Verify the request comes from an admin user and return their ID.
 * Convenience wrapper for routes that only need the admin user ID.
 */
export async function checkAdminId(req: NextRequest): Promise<string | null> {
  const user = await checkAdmin(req);
  return user?.id ?? null;
}

/**
 * Verify the request comes from a staff or admin user.
 *
 * Currently equivalent to checkAdmin() because staff role enforcement via
 * center_staff_memberships is not yet wired. When staff support is activated,
 * this function should also check center_staff_memberships for an active
 * membership with role IN ('staff', 'admin', 'center_admin', 'super_admin').
 *
 * Routes that should eventually allow staff access should use this function
 * instead of checkAdmin() so they automatically gain staff support later.
 */
export async function checkStaffOrAdmin(req: NextRequest): Promise<User | null> {
  // Phase 1: admin-only (staff not yet enforced)
  return checkAdmin(req);
}
