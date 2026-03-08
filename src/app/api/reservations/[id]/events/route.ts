import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';

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
  const { data: reservation } = await auth.supabase
    .from('reservations')
    .select('id, child_id, children!inner(parent_id)')
    .eq('id', reservationId)
    .single();

  if (!reservation) return badRequest('Reservation not found');

  if ((reservation as any).children?.parent_id !== auth.parentId) {
    return unauthorized();
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
