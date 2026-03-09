import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getActiveCenterId, getCenterMembership } from '@/lib/role-helpers';

/**
 * POST /api/auth/me
 *
 * Called after signInWithPassword succeeds. Uses the service-role client to:
 * 1. Verify the caller's JWT
 * 2. Check center_memberships for operational role
 * 3. Fall back to parents table for identity verification
 * 4. Return the user's role for redirect routing
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
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  console.log(`[api/auth/me] getUser: id=${user?.id ?? 'null'} error=${userError?.message ?? 'none'}`);

  if (!user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Check center_memberships for operational role
  const centerId = await getActiveCenterId();
  let role = 'parent';

  if (centerId) {
    const membership = await getCenterMembership(user.id, centerId);
    if (membership && membership.membership_status === 'active') {
      role = membership.role;
      console.log(`[api/auth/me] membership found: role=${role}`);
    }
  }

  // Verify user exists (check users table, fall back to parents)
  const { data: userRow } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!userRow) {
    const { data: parent } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!parent) {
      return NextResponse.json({ error: 'No profile found for this account' }, { status: 404 });
    }
  }

  return NextResponse.json({ role });
}
