import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, verifyGuardianAccess, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';
import { checkIdempotencyKey, saveIdempotencyResult } from '@/lib/idempotency';

const createVerificationSchema = z.object({
  authorized_pickup_id: z.string().uuid().optional().nullable(),
  verified_name: z.string().min(1).max(200),
  verified_relationship: z.string().min(1).max(100),
  verification_method: z.enum(['photo_id', 'pin', 'facial_recognition', 'known_person']),
  notes: z.string().max(1000).optional().nullable(),
});

/**
 * GET /api/attendance/:id/pickup-verification
 * Fetch pickup verification for an attendance session.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: sessionId } = await params;

  // Verify session belongs to parent's child
  const { data: session } = await supabaseAdmin
    .from('child_attendance_sessions')
    .select('id, child_id')
    .eq('id', sessionId)
    .single();

  if (!session) return badRequest('Attendance session not found');

  const guardian = await verifyGuardianAccess(auth.userId, session.child_id);
  if (!guardian) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', session.child_id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const { data: verification, error } = await auth.supabase
    .from('pickup_verifications')
    .select('*')
    .eq('attendance_session_id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') return badRequest('Failed to load verification');

  return NextResponse.json({ verification: verification || null });
}

/**
 * POST /api/attendance/:id/pickup-verification
 * Record a pickup verification for an attendance session. Immutable — one per session.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cached = await checkIdempotencyKey(req);
  if (cached) return cached;

  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: sessionId } = await params;

  // Verify session exists and belongs to parent's child
  const { data: session } = await supabaseAdmin
    .from('child_attendance_sessions')
    .select('id, child_id, status')
    .eq('id', sessionId)
    .single();

  if (!session) return badRequest('Attendance session not found');

  const guardianPost = await verifyGuardianAccess(auth.userId, session.child_id);
  if (!guardianPost) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', session.child_id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  if (!['ready_for_pickup', 'checked_out'].includes(session.status)) {
    return badRequest('Pickup verification only allowed for sessions in ready_for_pickup or checked_out status');
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = createVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data: verification, error } = await supabaseAdmin
    .from('pickup_verifications')
    .insert({
      attendance_session_id: sessionId,
      authorized_pickup_id: parsed.data.authorized_pickup_id || null,
      verified_name: parsed.data.verified_name,
      verified_relationship: parsed.data.verified_relationship,
      verification_method: parsed.data.verification_method,
      verified_by: auth.userId,
      notes: parsed.data.notes || null,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return badRequest('Pickup verification already exists for this session');
    }
    return badRequest(error.message);
  }

  // Log to child event ledger
  await supabaseAdmin.from('child_events').insert({
    child_id: session.child_id,
    event_type: 'authorized_pickup_verified',
    event_data: {
      session_id: sessionId,
      verification_id: verification.id,
      method: parsed.data.verification_method,
    },
    created_by: auth.userId,
  });

  const responseBody = { verification };
  await saveIdempotencyResult(req, auth.userId, 201, responseBody);
  return NextResponse.json(responseBody, { status: 201 });
}
