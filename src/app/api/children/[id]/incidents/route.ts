import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';
import { checkIdempotencyKey, saveIdempotencyResult } from '@/lib/idempotency';
import { writeCareEvent } from '@/lib/care-events';
import { ensureIncidentCaseFile } from '@/lib/incident-case-files';

const createIncidentSchema = z.object({
  attendance_session_id: z.string().uuid().optional().nullable(),
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
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return badRequest('Child not found');

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  let query = auth.supabase
    .from('incident_reports')
    .select('*', { count: 'exact' })
    .eq('child_id', childId)
    .eq('facility_id', auth.activeFacilityId)
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
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return badRequest('Child not found');

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
      facility_id: auth.activeFacilityId,
      severity: parsed.data.severity,
      category: parsed.data.category,
      summary: parsed.data.summary,
      details: parsed.data.details || null,
      reported_by: auth.userId,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  await ensureIncidentCaseFile(incident.id);

  await writeCareEvent({
    eventType: 'incident_created',
    actorType: 'PARENT',
    actorUserId: auth.userId,
    facilityId: auth.activeFacilityId,
    childId,
    parentId: auth.parentId,
    incidentId: incident.id,
    attendanceSessionId: incident.attendance_session_id,
    metadata: { severity: incident.severity, category: incident.category },
  });

  const responseBody = { incident };
  await saveIdempotencyResult(req, auth.userId, 201, responseBody);
  return NextResponse.json(responseBody, { status: 201 });
}


const updateIncidentSchema = z.object({
  incident_id: z.string().uuid(),
  summary: z.string().min(1).max(500).optional(),
  details: z.string().max(5000).optional().nullable(),
  status: z.enum(['open','investigating','resolved','closed']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.string().min(1).max(100).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth || !auth.activeFacilityId) return unauthorized();
  const { id: childId } = await params;

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = updateIncidentSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map(e => e.message).join(', '));

  const updates: Record<string, any> = {};
  if (parsed.data.summary !== undefined) updates.summary = parsed.data.summary;
  if (parsed.data.details !== undefined) updates.details = parsed.data.details;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.severity !== undefined) updates.severity = parsed.data.severity;
  if (parsed.data.category !== undefined) updates.category = parsed.data.category;

  const { data: incident, error } = await supabaseAdmin
    .from('incident_reports')
    .update(updates)
    .eq('id', parsed.data.incident_id)
    .eq('child_id', childId)
    .eq('facility_id', auth.activeFacilityId)
    .select()
    .single();

  if (error || !incident) return badRequest('Failed to update incident');

  await ensureIncidentCaseFile(incident.id);
  await supabaseAdmin
    .from('incident_case_files')
    .update({ severity: incident.severity, category: incident.category })
    .eq('incident_id', incident.id)
    .eq('facility_id', auth.activeFacilityId);

  await writeCareEvent({
    eventType: parsed.data.status === 'resolved' ? 'incident_resolved' : 'incident_updated',
    actorType: 'PARENT',
    actorUserId: auth.userId,
    facilityId: auth.activeFacilityId,
    childId,
    parentId: auth.parentId,
    incidentId: incident.id,
    metadata: { status: incident.status },
  });

  return NextResponse.json({ incident });
}
