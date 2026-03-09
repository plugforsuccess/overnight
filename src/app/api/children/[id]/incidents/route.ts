import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, verifyGuardianAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';
import { checkIdempotencyKey, saveIdempotencyResult } from '@/lib/idempotency';

const createIncidentSchema = z.object({
  attendance_session_id: z.string().uuid().optional().nullable(),
  center_id: z.string().uuid().optional().nullable(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string().min(1).max(100),
  summary: z.string().min(1).max(500),
  details: z.string().max(5000).optional().nullable(),
});

/**
 * GET /api/children/:id/incidents
 * Fetch incident reports for a child. Parents can view their own children's incidents.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: childId } = await params;

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  let query = supabaseAdmin
    .from('incident_reports')
    .select('*', { count: 'exact' })
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: incidents, error, count } = await query;

  if (error) return badRequest('Failed to load incidents');

  return NextResponse.json({ incidents: incidents || [], total: count || 0 });
}

/**
 * POST /api/children/:id/incidents
 * Create an incident report. Typically by admin/staff, but parents can also report.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cached = await checkIdempotencyKey(req);
  if (cached) return cached;

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: childId } = await params;

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = createIncidentSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data: incident, error } = await supabaseAdmin
    .from('incident_reports')
    .insert({
      child_id: childId,
      attendance_session_id: parsed.data.attendance_session_id || null,
      center_id: parsed.data.center_id || null,
      severity: parsed.data.severity,
      category: parsed.data.category,
      summary: parsed.data.summary,
      details: parsed.data.details || null,
      reported_by: auth.userId,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  // Log to child event ledger
  await supabaseAdmin.from('child_events').insert({
    child_id: childId,
    event_type: 'incident_reported',
    event_data: { incident_id: incident.id, severity: incident.severity, category: incident.category },
    created_by: auth.userId,
  });

  const responseBody = { incident };
  await saveIdempotencyResult(req, auth.userId, 201, responseBody);
  return NextResponse.json(responseBody, { status: 201 });
}
