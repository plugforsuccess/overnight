import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

export interface AuthResult {
  supabase: SupabaseClient;
  /** Supabase auth user UUID (auth.uid()) */
  userId: string;
  /** parents.id (PK) — the FK used in children.parent_id, etc. */
  parentId: string;
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve parents.id from auth_user_id — parent_id FK throughout the app
  const { data: parentRow } = await supabaseAdmin
    .from('parents')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (!parentRow) return null;

  return { supabase, userId: user.id, parentId: parentRow.id };
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
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
