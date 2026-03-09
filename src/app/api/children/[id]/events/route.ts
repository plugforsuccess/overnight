import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';

const eventSchema = z.object({
  event_type: z.string().min(1, 'Event type is required').max(100),
  event_data: z.record(z.string(), z.unknown()).default({}),
});

/**
 * GET /api/children/:id/events
 * Fetch the event ledger for a child. Parents can view events for their own children.
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { data: events, error, count } = await auth.supabase
    .from('child_events')
    .select('*', { count: 'exact' })
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return badRequest('Failed to load events');

  return NextResponse.json({ events: events || [], total: count || 0 });
}

/**
 * POST /api/children/:id/events
 * Append an event to the child's safety ledger.
 * Events are immutable — no update or delete.
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

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data: event, error } = await supabaseAdmin
    .from('child_events')
    .insert({
      child_id: childId,
      event_type: parsed.data.event_type,
      event_data: parsed.data.event_data,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  return NextResponse.json({ event }, { status: 201 });
}
