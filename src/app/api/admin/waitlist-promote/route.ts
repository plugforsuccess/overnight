import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { checkAdmin } from '@/lib/admin-auth';

/**
 * POST /api/admin/waitlist-promote
 * Body: { careDate: "2026-03-15" }
 *
 * Atomically promotes the next waitlisted reservation_night for a given date.
 * Admin-only. Uses the promote_waitlist() PL/pgSQL function which:
 * 1. Locks the program_capacity row
 * 2. Finds the highest-priority (FIFO) waitlisted night
 * 3. Transitions waitlisted → confirmed
 * 4. Updates capacity counters atomically
 *
 * Returns the promoted reservation_night details, or null if no one waiting.
 */
export async function POST(req: NextRequest) {
  const auth = await checkAdmin(req);
  if (!auth) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const user = { id: auth.id };

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { careDate } = body;
  if (!careDate || !/^\d{4}-\d{2}-\d{2}$/.test(careDate)) {
    return NextResponse.json({ error: 'careDate is required (YYYY-MM-DD)' }, { status: 400 });
  }

  // Call the atomic promote function
  const { data: promotedNightId, error: promoteError } = await supabaseAdmin.rpc('promote_waitlist', {
    p_care_date: careDate,
  });

  if (promoteError) {
    console.error(`[waitlist-promote] RPC error:`, promoteError);
    return NextResponse.json({ error: 'Promotion failed', details: promoteError.message }, { status: 500 });
  }

  if (!promotedNightId) {
    return NextResponse.json({
      promoted: false,
      message: 'No waitlisted entries to promote for this date, or night is still full.',
    });
  }

  // Fetch the promoted night details for the response
  const { data: promotedNight } = await supabaseAdmin
    .from('reservation_nights')
    .select('id, reservation_id, child_id, care_date, status, child:children(first_name, last_name)')
    .eq('id', promotedNightId)
    .single();

  // Log the admin action
  await supabaseAdmin.from('audit_log').insert({
    actor_id: user.id,
    action: 'waitlist_promoted',
    target_type: 'reservation_night',
    target_id: promotedNightId,
    details: { care_date: careDate, promoted_night: promotedNight },
  });

  console.log(`[waitlist-promote] admin=${user.id} promoted night=${promotedNightId} for date=${careDate}`);

  return NextResponse.json({
    promoted: true,
    reservationNight: promotedNight,
  });
}
