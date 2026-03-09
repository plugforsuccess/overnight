import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

export interface AuthResult {
  supabase: SupabaseClient;
  /** Supabase auth user UUID (auth.uid()) */
  userId: string;
  /** parents.id (PK) — the FK used in children.parent_id, etc. */
  parentId: string;
  /** Role from parents table (e.g. 'parent' | 'admin') */
  role: string;
  /** Whether user has admin privileges (role='admin' OR is_admin=true) */
  isAdmin: boolean;
}

/**
 * Authenticate a request and return the Supabase client + user ID + parent ID.
 * Returns null if not authenticated or parent profile not found.
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

  // parents.id = auth.users.id — single canonical identity, no extra lookup needed
  // Verify the parent row exists and fetch role info
  const { data: parentRow, error: parentError } = await supabaseAdmin
    .from('parents')
    .select('id, role, is_admin')
    .eq('id', user.id)
    .single();

  console.log(`[api-auth] parent lookup: found=${!!parentRow} error=${parentError?.message ?? 'none'}`);
  if (!parentRow) return null;

  const role = parentRow.role ?? 'parent';
  const isAdmin = role === 'admin' || parentRow.is_admin === true;

  return { supabase, userId: user.id, parentId: user.id, role, isAdmin };
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
