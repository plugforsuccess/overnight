import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateParentForFacility } from '@/lib/facility-auth';

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

  // parents.id = auth.users.id — look up directly by id
  const { data: parent, error: parentError } = await supabaseAdmin
    .from('parents')
    .select('id, role')
    .eq('id', user.id)
    .single();

  console.log(`[api/auth/me] parent lookup: found=${!!parent} role=${parent?.role ?? 'null'} error=${parentError?.message ?? 'none'}`);

  if (!parent) {
    return NextResponse.json({ error: 'No parent profile found for this account' }, { status: 404 });
  }

  const facilitySession = await authenticateParentForFacility(req);

  return NextResponse.json({
    role: parent.role ?? 'parent',
    activeFacilityId: facilitySession?.activeFacilityId ?? null,
    activeFacilitySlug: facilitySession?.activeFacilitySlug ?? null,
    activeFacilityRole: facilitySession?.activeFacilityRole ?? null,
    platformRole: facilitySession?.platformRole ?? 'NONE',
  });
}
