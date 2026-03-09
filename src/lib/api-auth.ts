import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  requireGuardianAccess,
  getGuardianChildIds,
  type GuardianAccessResult,
} from '@/lib/role-helpers';

export interface AuthResult {
  supabase: SupabaseClient;
  /** Supabase auth user UUID (auth.uid()) */
  userId: string;
  /** Alias for userId — maintained for backward compatibility */
  parentId: string;
}

/**
 * Authenticate a request and return the Supabase client + user ID.
 * Validates the user exists in the `users` table (canonical identity).
 * Falls back to `parents` table if user not yet in `users` (graceful migration).
 * Returns null if not authenticated or user profile not found.
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthResult | null> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log(`[api-auth] getUser: id=${user?.id ?? 'null'} error=${userError?.message ?? 'none'}`);
  if (!user) return null;

  // Check canonical users table first
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!userRow) {
    // Fallback: check parents table for users not yet backfilled
    const { data: parentRow } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('id', user.id)
      .single();

    console.log(`[api-auth] users miss, parents fallback: found=${!!parentRow}`);
    if (!parentRow) return null;
  }

  return { supabase, userId: user.id, parentId: user.id };
}

/**
 * Verify the authenticated user has guardian access to a specific child.
 * Returns the guardian link if authorized, null otherwise.
 */
export async function verifyGuardianAccess(
  userId: string,
  childId: string,
  permission?: 'can_book' | 'can_view_billing' | 'can_manage_pickups'
): Promise<GuardianAccessResult | null> {
  return requireGuardianAccess(userId, childId, permission);
}

/**
 * Get all child IDs the user has guardian access to.
 */
export async function getAccessibleChildIds(userId: string): Promise<string[]> {
  return getGuardianChildIds(userId);
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbidden(message = 'Access denied') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
  // Sanitize database error messages to avoid leaking schema details
  const sanitized = isDbError(message) ? 'An error occurred. Please try again.' : message;
  return NextResponse.json({ error: sanitized }, { status: 400 });
}

function isDbError(message: string): boolean {
  const dbPatterns = [
    'violates',
    'constraint',
    'relation',
    'column',
    'duplicate key',
    'syntax error',
    'permission denied',
    'does not exist',
    'null value',
    'foreign key',
    'SQLSTATE',
  ];
  return dbPatterns.some(p => message.toLowerCase().includes(p.toLowerCase()));
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Log an audit event for sensitive child data changes.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from('audit_log').insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}
