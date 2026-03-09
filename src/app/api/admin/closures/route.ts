import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { previewOverrideImpact } from '@/lib/closures/preview';
import { applyOverride } from '@/lib/closures/apply';
import { reopenNights } from '@/lib/closures/reopen';
import { listOverrides } from '@/lib/closures/list';
import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const previewSchema = z.object({
  action: z.literal('preview'),
  startDate: z.string().regex(dateRegex, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(dateRegex, 'endDate must be YYYY-MM-DD'),
  overrideAction: z.enum(['close', 'reduce_capacity', 'reopen']),
  capacityOverride: z.number().int().min(0).optional().nullable(),
});

const applySchema = z.object({
  action: z.literal('apply'),
  startDate: z.string().regex(dateRegex, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(dateRegex, 'endDate must be YYYY-MM-DD'),
  overrideAction: z.enum(['close', 'reduce_capacity']),
  capacityOverride: z.number().int().min(0).optional().nullable(),
  reasonCode: z.enum(['holiday', 'staff_shortage', 'weather', 'facility_issue', 'emergency_closure', 'low_demand', 'maintenance', 'other']),
  reasonText: z.string().max(500).optional(),
});

const reopenSchema = z.object({
  action: z.literal('reopen'),
  startDate: z.string().regex(dateRegex, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(dateRegex, 'endDate must be YYYY-MM-DD'),
  reasonText: z.string().max(500).optional(),
});

/**
 * GET /api/admin/closures?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List active overrides for a date range.
 */
export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { action } = body;
  if (!action || !['preview', 'apply', 'reopen'].includes(action)) {
    return NextResponse.json({ error: 'action must be one of: preview, apply, reopen' }, { status: 400 });
  }

  // Validate request body against action-specific schema
  const schema = action === 'preview' ? previewSchema : action === 'apply' ? applySchema : reopenSchema;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(e => e.message).join(', ') }, { status: 400 });
  }

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
    const d = parsed.data as z.infer<typeof previewSchema>;
    const impact = await previewOverrideImpact(supabaseAdmin, {
      programId: program.id,
      startDate: d.startDate,
      endDate: d.endDate,
      action: d.overrideAction,
      capacityOverride: d.capacityOverride,
    });
    return NextResponse.json({ impact });
  }

  if (action === 'apply') {
    const d = parsed.data as z.infer<typeof applySchema>;
    const result = await applyOverride(supabaseAdmin, {
      programId: program.id,
      centerId: program.center_id,
      startDate: d.startDate,
      endDate: d.endDate,
      action: d.overrideAction,
      capacityOverride: d.capacityOverride,
      reasonCode: d.reasonCode,
      reasonText: d.reasonText,
      actorUserId: admin.id,
    });
    return NextResponse.json({ result });
  }

  // action === 'reopen'
  const d = parsed.data as z.infer<typeof reopenSchema>;
  const result = await reopenNights(supabaseAdmin, {
    programId: program.id,
    centerId: program.center_id,
    startDate: d.startDate,
    endDate: d.endDate,
    reasonText: d.reasonText,
    actorUserId: admin.id,
    defaultCapacity,
  });
  return NextResponse.json({ result });
}
