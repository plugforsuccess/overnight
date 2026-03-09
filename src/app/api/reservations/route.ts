import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, logAuditEvent } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/reservations
 * Returns all reservations for the authenticated parent's children,
 * split into upcoming and past.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { parentId } = auth;

  // Get all child IDs belonging to this parent
  const { data: children, error: childError } = await supabaseAdmin
    .from('children')
    .select('id, first_name, last_name')
    .eq('parent_id', parentId)
    .eq('facility_id', auth.activeFacilityId);

  if (childError) {
    console.error('[api/reservations] children query error:', childError);
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }

  const childIds = (children || []).map((c: { id: string }) => c.id);
  const childMap = new Map<string, { id: string; first_name: string; last_name: string }>(
    (children || []).map((c: { id: string; first_name: string; last_name: string }) => [c.id, c])
  );

  if (childIds.length === 0) {
    return NextResponse.json({
      upcoming: [],
      past: [],
      counts: { upcoming: 0, completed: 0, action_needed: 0 },
    });
  }

  const today = new Date().toISOString().split('T')[0];

  // Fetch all reservations for parent's children
  const { data: reservations, error: resError } = await supabaseAdmin
    .from('reservations')
    .select('id, child_id, date, status, admin_override, overnight_block_id, created_at, updated_at')
    .eq('facility_id', auth.activeFacilityId)
    .in('child_id', childIds)
    .order('date', { ascending: true });

  if (resError) {
    console.error('[api/reservations] reservations query error:', resError);
    return NextResponse.json({ error: 'Failed to load reservations' }, { status: 500 });
  }

  // Fetch overnight blocks for plan/billing context
  const blockIdSet = new Set((reservations || []).map((r: { overnight_block_id: string }) => r.overnight_block_id));
  const blockIds = Array.from(blockIdSet);
  let blockMap = new Map<string, { id: string; weekly_price_cents: number; status: string; plan_id: string }>();

  if (blockIds.length > 0) {
    const { data: blocks } = await supabaseAdmin
      .from('overnight_blocks')
      .select('id, weekly_price_cents, status, plan_id')
      .eq('facility_id', auth.activeFacilityId)
      .in('id', blockIds);

    if (blocks) {
      blockMap = new Map(blocks.map((b: { id: string; weekly_price_cents: number; status: string; plan_id: string }) => [b.id, b]));
    }
  }

  // Transform and split reservations
  const allReservations = (reservations || []).map((r: {
    id: string;
    child_id: string;
    date: string;
    status: string;
    admin_override: boolean;
    overnight_block_id: string;
    created_at: string;
    updated_at: string;
  }) => {
    const child = childMap.get(r.child_id);
    const block = blockMap.get(r.overnight_block_id);
    return {
      id: r.id,
      child_id: r.child_id,
      child_first_name: child?.first_name || '',
      child_last_name: child?.last_name || '',
      date: r.date,
      status: r.status,
      overnight_block_id: r.overnight_block_id,
      weekly_price_cents: block?.weekly_price_cents || null,
      block_status: block?.status || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });

  const upcoming = allReservations.filter(
    (r: { date: string; status: string }) => r.date >= today && !['canceled', 'canceled_low_enrollment'].includes(r.status)
  );
  const past = allReservations
    .filter((r: { date: string; status: string }) => r.date < today || ['canceled', 'canceled_low_enrollment'].includes(r.status))
    .reverse(); // most recent first for past

  const counts = {
    upcoming: upcoming.length,
    completed: allReservations.filter((r: { date: string; status: string }) => r.date < today && r.status === 'confirmed').length,
    action_needed: allReservations.filter((r: { status: string }) => r.status === 'pending_payment').length,
  };

  return NextResponse.json({ upcoming, past, counts });
}

/**
 * DELETE /api/reservations?id=<reservation_id>
 * Cancel a reservation owned by the authenticated parent.
 */
export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { parentId } = auth;
  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('id');

  if (!reservationId) {
    return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });
  }

  // Verify reservation belongs to a child of this parent
  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select('id, child_id, overnight_block_id, status')
    .eq('id', reservationId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!reservation) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
  }

  // Verify child ownership
  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id')
    .eq('id', reservation.child_id)
    .eq('parent_id', parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) {
    return NextResponse.json({ error: 'Not authorized to cancel this reservation' }, { status: 403 });
  }

  if (['canceled', 'canceled_low_enrollment'].includes(reservation.status)) {
    return NextResponse.json({ error: 'Reservation is already cancelled' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('facility_id', auth.activeFacilityId);

  if (error) {
    console.error('[api/reservations] cancel error:', error);
    return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 500 });
  }

  // Audit log
  await logAuditEvent(
    supabaseAdmin,
    parentId,
    'reservation.cancelled',
    'reservation',
    reservationId,
    { child_id: reservation.child_id }
  );

  return NextResponse.json({ success: true });
}
