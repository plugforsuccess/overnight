import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/admin/health/runs
 * List recent health check runs.
 */
export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: runs, error } = await supabaseAdmin
    .from('health_check_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runs: runs || [] });
}
