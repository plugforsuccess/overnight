import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  getActiveCenterId,
  requireCenterRole,
  FULL_ADMIN_ROLES,
  STAFF_ROLES,
  BILLING_ROLES,
  ALL_ADMIN_ROLES,
  type CenterRole,
  type CenterMembershipResult,
} from '@/lib/role-helpers';

export interface AdminAuthResult {
  userId: string;
  centerId: string;
  role: CenterRole;
  membership: CenterMembershipResult;
}

/**
 * Authenticate a request and verify the user has one of the allowed
 * center membership roles. Returns the user info + membership, or null.
 */
async function checkCenterRole(
  req: NextRequest,
  allowedRoles: readonly CenterRole[]
): Promise<AdminAuthResult | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const centerId = await getActiveCenterId();
  if (!centerId) return null;

  const membership = await requireCenterRole(user.id, centerId, [...allowedRoles]);
  if (!membership) return null;

  return {
    userId: user.id,
    centerId,
    role: membership.role,
    membership,
  };
}

/**
 * Verify the request comes from a user with full admin access (owner or admin).
 * Returns the user object if authorized, null otherwise.
 *
 * This is the canonical admin gate — replaces the legacy parents.role check.
 */
export async function checkAdmin(req: NextRequest) {
  const result = await checkCenterRole(req, FULL_ADMIN_ROLES);
  if (!result) return null;

  // Return a user-shaped object for backward compatibility with existing callers
  return { id: result.userId, role: result.role, centerId: result.centerId };
}

/**
 * Verify the request comes from a user with full admin access.
 * Returns the full AdminAuthResult for callers that need role details.
 */
export async function checkAdminWithRole(req: NextRequest): Promise<AdminAuthResult | null> {
  return checkCenterRole(req, FULL_ADMIN_ROLES);
}

/**
 * Verify the request comes from a user with staff-level or higher access.
 * Allows: owner, admin, manager, staff
 */
export async function checkStaff(req: NextRequest): Promise<AdminAuthResult | null> {
  return checkCenterRole(req, STAFF_ROLES);
}

/**
 * Verify the request comes from a user with billing access.
 * Allows: owner, admin, manager, billing_only
 */
export async function checkBilling(req: NextRequest): Promise<AdminAuthResult | null> {
  return checkCenterRole(req, BILLING_ROLES);
}

/**
 * Verify the request comes from any user with an active center membership.
 * Used for routes accessible to all admin-panel roles.
 */
export async function checkAnyAdminRole(req: NextRequest): Promise<AdminAuthResult | null> {
  return checkCenterRole(req, ALL_ADMIN_ROLES);
}
