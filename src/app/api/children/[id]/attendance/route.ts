import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';
import { VALID_ATTENDANCE_TRANSITIONS } from '@/types/children';

const VALID_STATUSES = ['scheduled', 'checked_in', 'in_care', 'ready_for_pickup', 'checked_out', 'cancelled'] as const;

const createSessionSchema = z.object({
  reservation_id: z.string().uuid().optional().nullable(),
  status: z.enum(VALID_STATUSES).default('scheduled'),
  notes: z.string().max(1000).optional().nullable(),
});

const updateSessionSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  check_in_at: z.string().datetime().optional().nullable(),
  check_out_at: z.string().datetime().optional().nullable(),
  pickup_person_name: z.string().max(100).optional().nullable(),
  pickup_relationship: z.string().max(100).optional().nullable(),
  pickup_verified: z.boolean().optional(),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * GET /api/children/:id/attendance
 * Fetch attendance sessions for a child. Parents can view their own children's sessions.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return badRequest('Child not found');

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const status = url.searchParams.get('status');

  let query = auth.supabase
    .from('child_attendance_sessions')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && VALID_STATUSES.includes(status as any)) {
    query = query.eq('status', status);
  }

  const { data: sessions, error } = await query;

  if (error) return badRequest('Failed to load attendance sessions');

  return NextResponse.json({ sessions: sessions || [] });
}

/**
 * POST /api/children/:id/attendance
 * Create an attendance session. Typically created by admin/staff,
 * but parents can create scheduled sessions linked to reservations.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return badRequest('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data: session, error } = await supabaseAdmin
    .from('child_attendance_sessions')
    .insert({
      child_id: childId,
      reservation_id: parsed.data.reservation_id || null,
      status: parsed.data.status,
      notes: parsed.data.notes || null,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  // Log event
  await supabaseAdmin.from('child_events').insert({
    child_id: childId,
    event_type: 'attendance_session_created',
    event_data: { session_id: session.id, status: session.status },
    created_by: auth.userId,
  });

  return NextResponse.json({ session }, { status: 201 });
}

/**
 * PATCH /api/children/:id/attendance
 * Update an attendance session (e.g., check-in, check-out, status changes).
 * Requires session_id in query params.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: childId } = await params;

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) return badRequest('session_id query parameter is required');

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return badRequest('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = updateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  // Server-side attendance state transition validation (complements DB trigger)
  if (parsed.data.status !== undefined) {
    const { data: currentSession } = await supabaseAdmin
      .from('child_attendance_sessions')
      .select('status')
      .eq('id', sessionId)
      .eq('child_id', childId)
      .single();

    if (!currentSession) return badRequest('Attendance session not found');

    const allowedNext = VALID_ATTENDANCE_TRANSITIONS[currentSession.status] || [];
    if (parsed.data.status !== currentSession.status && !allowedNext.includes(parsed.data.status)) {
      return badRequest(`Invalid status transition: ${currentSession.status} → ${parsed.data.status}`);
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.check_in_at !== undefined) updateData.check_in_at = parsed.data.check_in_at;
  if (parsed.data.check_out_at !== undefined) updateData.check_out_at = parsed.data.check_out_at;
  if (parsed.data.pickup_person_name !== undefined) updateData.pickup_person_name = parsed.data.pickup_person_name;
  if (parsed.data.pickup_relationship !== undefined) updateData.pickup_relationship = parsed.data.pickup_relationship;
  if (parsed.data.pickup_verified !== undefined) updateData.pickup_verified = parsed.data.pickup_verified;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const { data: session, error } = await supabaseAdmin
    .from('child_attendance_sessions')
    .update(updateData)
    .eq('id', sessionId)
    .eq('child_id', childId)
    .select()
    .single();

  if (error) return badRequest(error.message);

  // Log status change event
  if (parsed.data.status) {
    await supabaseAdmin.from('child_events').insert({
      child_id: childId,
      event_type: `attendance_${parsed.data.status}`,
      event_data: { session_id: sessionId },
      created_by: auth.userId,
    });
  }

  return NextResponse.json({ session });
}
