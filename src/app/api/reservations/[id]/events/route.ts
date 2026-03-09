import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, verifyGuardianAccess, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/reservations/:id/events
 * Fetch the event ledger for a reservation. Parents can view events for their own reservations.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: reservationId } = await params;

  // Verify reservation belongs to parent via child ownership
  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select('id, child_id')
    .eq('id', reservationId)
    .single();

  if (!reservation) return badRequest('Reservation not found');

  const guardian = await verifyGuardianAccess(auth.userId, reservation.child_id);
  if (!guardian) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', reservation.child_id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { data: events, error, count } = await auth.supabase
    .from('reservation_events')
    .select('*', { count: 'exact' })
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return badRequest('Failed to load reservation events');

  return NextResponse.json({ events: events || [], total: count || 0 });
}
