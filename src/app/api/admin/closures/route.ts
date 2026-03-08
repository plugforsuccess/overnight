import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { previewOverrideImpact } from '@/lib/closures/preview';
import { applyOverride } from '@/lib/closures/apply';
import { reopenNights } from '@/lib/closures/reopen';
import { listOverrides } from '@/lib/closures/list';

/**
 * GET /api/admin/closures?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List active overrides for a date range.
 */
export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start = req.nextUrl.searchParams.get('start');
  const end = req.nextUrl.searchParams.get('end');
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params required' }, { status: 400 });
  }

  // Get the first program (single-center deployment)
  const { data: program } = await supabaseAdmin
    .from('programs')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!program) return NextResponse.json({ overrides: [] });

  const overrides = await listOverrides(supabaseAdmin, program.id, start, end);
  return NextResponse.json({ overrides });
}

/**
 * POST /api/admin/closures
 * Body: { action: 'preview' | 'apply' | 'reopen', ... }
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // Resolve program and center for single-center deployment
  const { data: program } = await supabaseAdmin
    .from('programs')
    .select('id, center_id')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!program) {
    return NextResponse.json({ error: 'No active program found' }, { status: 404 });
  }

  // Get default capacity
  const { data: settings } = await supabaseAdmin
    .from('admin_settings')
    .select('max_capacity')
    .limit(1)
    .single();
  const defaultCapacity = settings?.max_capacity ?? 6;

  if (action === 'preview') {
    const impact = await previewOverrideImpact(supabaseAdmin, {
      programId: program.id,
      startDate: body.startDate,
      endDate: body.endDate,
      action: body.overrideAction,
      capacityOverride: body.capacityOverride,
    });
    return NextResponse.json({ impact });
  }

  if (action === 'apply') {
    if (!body.overrideAction || !body.startDate || !body.endDate || !body.reasonCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const result = await applyOverride(supabaseAdmin, {
      programId: program.id,
      centerId: program.center_id,
      startDate: body.startDate,
      endDate: body.endDate,
      action: body.overrideAction,
      capacityOverride: body.capacityOverride,
      reasonCode: body.reasonCode,
      reasonText: body.reasonText,
      actorUserId: admin.id,
    });
    return NextResponse.json({ result });
  }

  if (action === 'reopen') {
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const result = await reopenNights(supabaseAdmin, {
      programId: program.id,
      centerId: program.center_id,
      startDate: body.startDate,
      endDate: body.endDate,
      reasonText: body.reasonText,
      actorUserId: admin.id,
      defaultCapacity,
    });
    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
