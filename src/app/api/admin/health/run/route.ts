import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { runHealthChecks } from '@/lib/health/run-health-checks';

/**
 * POST /api/admin/health/run
 * Run health checks on demand.
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await runHealthChecks(supabaseAdmin, 'manual', admin.id);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
