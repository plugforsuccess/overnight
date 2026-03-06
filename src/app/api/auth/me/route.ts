import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * POST /api/auth/me
 *
 * Called after signInWithPassword succeeds. Uses the service-role client to:
 * 1. Verify the caller's JWT
 * 2. Find their parent row by id (= auth.users.id)
 * 3. Return the parent's role for redirect routing
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  if (!token) {
    console.log('[/api/auth/me] missing token');
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  // Verify the JWT and get the authenticated user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    console.log('[/api/auth/me] invalid token', { error: userError?.message });
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  console.log('[/api/auth/me] user verified', { userId: user.id, email: user.email });

  // parents.id = auth.users.id — look up directly by id
  const { data: parent, error: parentError } = await supabaseAdmin
    .from('parents')
    .select('id, role')
    .eq('id', user.id)
    .single();

  console.log('[/api/auth/me] parent lookup', {
    userId: user.id,
    email: user.email,
    parentFound: !!parent,
    parentError: parentError?.message ?? null,
    role: parent?.role ?? null,
  });

  if (!parent) {
    return NextResponse.json(
      { error: 'No parent profile found for this account', code: 'PROFILE_MISSING' },
      { status: 404 },
    );
  }

  return NextResponse.json({ role: parent.role ?? 'parent' });
}
