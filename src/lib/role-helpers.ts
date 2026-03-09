/**
 * Multi-Tenant Role Helpers — Future Auth Layer
 *
 * These helpers implement center-scoped role checks using the new
 * `users`, `center_memberships`, and `child_guardians` tables.
 *
 * Phase C: run in parallel with existing parents.role checks.
 * Phase D: replace existing checks entirely.
 *
 * Usage:
 *   import { requireCenterRole, requireGuardianAccess } from '@/lib/role-helpers';
 */

import { supabaseAdmin } from '@/lib/supabase-server';

// ─── Role Constants ─────────────────────────────────────────────────────────

export const CENTER_ROLES = [
  'owner',
  'admin',
  'manager',
  'staff',
  'billing_only',
  'viewer',
] as const;

export type CenterRole = (typeof CENTER_ROLES)[number];

export const GUARDIAN_ROLES = [
  'parent',
  'guardian',
  'emergency_contact',
  'authorized_pickup_only',
] as const;

export type GuardianRole = (typeof GUARDIAN_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

// ─── Role Hierarchies ──────────────────────────────────────────────────────

/** Roles that grant full admin access to a center */
export const FULL_ADMIN_ROLES: CenterRole[] = ['owner', 'admin'];

/** Roles that grant operational (staff-level) access */
export const STAFF_ROLES: CenterRole[] = ['owner', 'admin', 'manager', 'staff'];

/** Roles that grant billing access */
export const BILLING_ROLES: CenterRole[] = ['owner', 'admin', 'manager', 'billing_only'];

/** All roles that can view admin interface */
export const ALL_ADMIN_ROLES: CenterRole[] = [
  'owner',
  'admin',
  'manager',
  'staff',
  'billing_only',
  'viewer',
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
}

export interface CenterMembershipResult {
  id: string;
  user_id: string;
  center_id: string;
  role: CenterRole;
  membership_status: MembershipStatus;
}

export interface GuardianAccessResult {
  id: string;
  child_id: string;
  user_id: string;
  guardian_role: GuardianRole;
  is_primary_guardian: boolean;
  can_book: boolean;
  can_view_billing: boolean;
  can_manage_pickups: boolean;
}

// ─── Auth Helpers ───────────────────────────────────────────────────────────

/**
 * Get the canonical user profile from the `users` table.
 * Returns null if the user doesn't exist.
 */
export async function getCurrentUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name, phone, status')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

/**
 * Get a user's center membership for a specific center.
 * Returns null if no active membership exists.
 */
export async function getCenterMembership(
  userId: string,
  centerId: string
): Promise<CenterMembershipResult | null> {
  const { data, error } = await supabaseAdmin
    .from('center_memberships')
    .select('id, user_id, center_id, role, membership_status')
    .eq('user_id', userId)
    .eq('center_id', centerId)
    .single();

  if (error || !data) return null;
  return data as CenterMembershipResult;
}

/**
 * Require that the user holds one of the specified roles at the given center.
 * Returns the membership if authorized, null otherwise.
 *
 * Example:
 *   const membership = await requireCenterRole(userId, centerId, ['owner', 'admin']);
 *   if (!membership) return unauthorized();
 */
export async function requireCenterRole(
  userId: string,
  centerId: string,
  allowedRoles: CenterRole[]
): Promise<CenterMembershipResult | null> {
  const membership = await getCenterMembership(userId, centerId);

  if (!membership) return null;
  if (membership.membership_status !== 'active') return null;
  if (!allowedRoles.includes(membership.role)) return null;

  return membership;
}

/**
 * Require that the user is a linked guardian of the specified child,
 * optionally checking a specific permission flag.
 *
 * Example:
 *   const access = await requireGuardianAccess(userId, childId, 'can_book');
 *   if (!access) return unauthorized();
 */
export async function requireGuardianAccess(
  userId: string,
  childId: string,
  permission?: 'can_book' | 'can_view_billing' | 'can_manage_pickups'
): Promise<GuardianAccessResult | null> {
  const { data, error } = await supabaseAdmin
    .from('child_guardians')
    .select(
      'id, child_id, user_id, guardian_role, is_primary_guardian, can_book, can_view_billing, can_manage_pickups'
    )
    .eq('user_id', userId)
    .eq('child_id', childId)
    .single();

  if (error || !data) return null;

  // Check specific permission if requested
  if (permission && !data[permission]) return null;

  return data as GuardianAccessResult;
}

/**
 * Check if a user has staff-level or higher access at a center.
 * Convenience wrapper for common admin/staff gate pattern.
 */
export async function checkStaffOrAdminForCenter(
  userId: string,
  centerId: string
): Promise<CenterMembershipResult | null> {
  return requireCenterRole(userId, centerId, STAFF_ROLES);
}

/**
 * Get all children linked to a user via child_guardians.
 * Used for parent dashboard to fetch the user's children.
 */
export async function getGuardianChildren(
  userId: string
): Promise<GuardianAccessResult[]> {
  const { data, error } = await supabaseAdmin
    .from('child_guardians')
    .select(
      'id, child_id, user_id, guardian_role, is_primary_guardian, can_book, can_view_billing, can_manage_pickups'
    )
    .eq('user_id', userId);

  if (error || !data) return [];
  return data as GuardianAccessResult[];
}

/**
 * Get all center memberships for a user.
 * Used for multi-center navigation and role switching.
 */
export async function getUserMemberships(
  userId: string
): Promise<CenterMembershipResult[]> {
  const { data, error } = await supabaseAdmin
    .from('center_memberships')
    .select('id, user_id, center_id, role, membership_status')
    .eq('user_id', userId)
    .eq('membership_status', 'active');

  if (error || !data) return [];
  return data as CenterMembershipResult[];
}
