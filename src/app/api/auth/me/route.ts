import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * POST /api/auth/me
 *
 * Called after signInWithPassword succeeds. Uses the service-role client to:
 * 1. Verify the caller's JWT
 * 2. Find their parents row by email (bypasses RLS)
 * 3. If auth_user_id is NULL, link it so future RLS queries work
 * 4. Return the parent's role for redirect routing
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  // Verify the JWT and get the authenticated user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Use admin client (bypasses RLS) to find parent by email
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, role, auth_user_id')
    .eq('email', user.email!)
    .single();

  if (!parent) {
    return NextResponse.json({ error: 'No parent profile found for this email' }, { status: 404 });
  }

  // Auto-link or fix auth_user_id if it's missing or mismatched
  if (parent.auth_user_id !== user.id) {
    await supabaseAdmin
      .from('parents')
      .update({ auth_user_id: user.id })
      .eq('id', parent.id);
  }

  return NextResponse.json({ role: parent.role ?? 'parent' });
}
