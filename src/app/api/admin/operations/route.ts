import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { createLogger, withCorrelationId } from '@/lib/logger';

async function checkAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, role, is_admin')
    .eq('id', user.id)
    .single();

  if (!parent || (parent.role !== 'admin' && !parent.is_admin)) return null;
  return user;
}

/**
 * GET /api/admin/operations?view=<view>
 *
 * Staff operations dashboard endpoints:
 *
 * view=attendance    — Live attendance board (today's reservations with status)
 * view=pickups       — Recent pickup verifications
 * view=incidents     — Open/recent incident reports (future; returns placeholder)
 * view=reservations  — Upcoming reservation monitoring with capacity
 * view=outbox        — Event outbox status / dead letters
 */
export async function GET(req: NextRequest) {
  const correlationId = withCorrelationId(req);
  const log = createLogger('api/admin/operations', correlationId);

  const user = await checkAdmin(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view');

  log.info('operations dashboard request', { view, adminId: user.id });

  // ─── Live Attendance Board ──────────────────────────────────────────────
  if (view === 'attendance') {
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const { data: reservations, error } = await supabaseAdmin
      .from('reservations')
      .select(`
        id,
        date,
        status,
        child:children(id, first_name, last_name, date_of_birth, parent_id),
        overnight_block:overnight_blocks(id, parent_id, payment_status)
      `)
      .eq('date', date)
      .in('status', ['confirmed', 'locked', 'pending_payment'])
      .order('created_at', { ascending: true });

    if (error) {
      log.error('attendance query failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to load attendance' }, { status: 500 });
    }

    // Fetch parent info for each reservation
    const parentIdSet = new Set<string>();
    for (const r of reservations || []) {
      const child = r.child as { parent_id?: string } | null;
      if (child?.parent_id) parentIdSet.add(child.parent_id);
    }
    const parentIds = Array.from(parentIdSet);

    let parents: Record<string, { first_name: string; last_name: string; phone: string | null }> = {};
    if (parentIds.length > 0) {
      const { data: parentData } = await supabaseAdmin
        .from('parents')
        .select('id, first_name, last_name, phone')
        .in('id', parentIds);

      parents = Object.fromEntries(
        (parentData || []).map((p) => [p.id, p]),
      );
    }

    // Get today's pickup events
    const { data: pickups } = await supabaseAdmin
      .from('pickup_events')
      .select('child_id, verification_method, created_at')
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);

    const pickedUpChildIds = new Set(
      (pickups || []).map((p: { child_id: string }) => p.child_id),
    );

    const attendance = (reservations || []).map((r) => {
      const childArr = r.child as Array<{ id: string; first_name: string; last_name: string; date_of_birth: string | null; parent_id: string }> | null;
      const child = Array.isArray(childArr) ? childArr[0] ?? null : childArr;
      return {
        reservationId: r.id,
        date: r.date,
        reservationStatus: r.status,
        child: child ? {
          id: child.id,
          firstName: child.first_name,
          lastName: child.last_name,
          dateOfBirth: child.date_of_birth,
        } : null,
        parent: child?.parent_id ? parents[child.parent_id] || null : null,
        pickedUp: child ? pickedUpChildIds.has(child.id) : false,
      };
    });

    const response = NextResponse.json({
      date,
      total: attendance.length,
      pickedUp: attendance.filter((a) => a.pickedUp).length,
      attendance,
    });
    response.headers.set('X-Correlation-ID', correlationId);
    return response;
  }

  // ─── Pickup Verification Log ────────────────────────────────────────────
  if (view === 'pickups') {
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const { data: pickups, error } = await supabaseAdmin
      .from('pickup_events')
      .select(`
        id,
        verification_method,
        notes,
        created_at,
        child:children(id, first_name, last_name),
        pickup_person:child_authorized_pickups(id, first_name, last_name, relationship),
        verified_by:parents!pickup_events_verified_by_staff_id_fkey(id, first_name, last_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      log.error('pickups query failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to load pickups' }, { status: 500 });
    }

    const response = NextResponse.json({ pickups: pickups || [] });
    response.headers.set('X-Correlation-ID', correlationId);
    return response;
  }

  // ─── Upcoming Reservations with Capacity ────────────────────────────────
  if (view === 'reservations') {
    const today = new Date().toISOString().split('T')[0];
    const daysAhead = parseInt(searchParams.get('days') || '14');
    const endDate = new Date(Date.now() + daysAhead * 86_400_000).toISOString().split('T')[0];

    // Get reservations grouped by date
    const { data: reservations, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('id, date, status, child_id')
      .gte('date', today)
      .lte('date', endDate)
      .in('status', ['confirmed', 'locked', 'pending_payment']);

    if (resError) {
      log.error('reservations query failed', { error: resError.message });
      return NextResponse.json({ error: 'Failed to load reservations' }, { status: 500 });
    }

    // Get capacity for these dates
    const { data: capacityData } = await supabaseAdmin
      .from('nightly_capacity')
      .select('date, capacity, confirmed_count, status')
      .gte('date', today)
      .lte('date', endDate);

    const capacityMap = new Map(
      (capacityData || []).map((c: { date: string; capacity: number; confirmed_count: number; status: string }) =>
        [c.date, c],
      ),
    );

    // Get waitlist counts
    const { data: waitlistData } = await supabaseAdmin
      .from('waitlist')
      .select('date')
      .gte('date', today)
      .lte('date', endDate)
      .eq('status', 'waiting');

    const waitlistByDate = new Map<string, number>();
    for (const w of waitlistData || []) {
      const d = w.date as string;
      waitlistByDate.set(d, (waitlistByDate.get(d) || 0) + 1);
    }

    // Group reservations by date
    const dateMap = new Map<string, { confirmed: number; pending: number }>();
    for (const r of reservations || []) {
      const d = r.date as string;
      if (!dateMap.has(d)) dateMap.set(d, { confirmed: 0, pending: 0 });
      const entry = dateMap.get(d)!;
      if (r.status === 'confirmed' || r.status === 'locked') {
        entry.confirmed++;
      } else {
        entry.pending++;
      }
    }

    const nightSummaries = Array.from(dateMap.entries()).map(([date, counts]) => {
      const cap = capacityMap.get(date);
      return {
        date,
        confirmed: counts.confirmed,
        pending: counts.pending,
        capacity: cap?.capacity ?? 6,
        capacityStatus: cap?.status ?? 'open',
        waitlistCount: waitlistByDate.get(date) ?? 0,
        utilizationPct: cap
          ? Math.round((counts.confirmed / cap.capacity) * 100)
          : Math.round((counts.confirmed / 6) * 100),
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const response = NextResponse.json({
      from: today,
      to: endDate,
      nights: nightSummaries,
    });
    response.headers.set('X-Correlation-ID', correlationId);
    return response;
  }

  // ─── Event Outbox Status ────────────────────────────────────────────────
  if (view === 'outbox') {
    const statusFilter = searchParams.get('status'); // pending, failed, dead_letter

    let query = supabaseAdmin
      .from('event_outbox')
      .select('id, event_type, aggregate_type, aggregate_id, status, retry_count, last_error, created_at, processed_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: events, error } = await query;

    if (error) {
      log.error('outbox query failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to load outbox' }, { status: 500 });
    }

    // Get summary counts
    const { data: statusCounts } = await supabaseAdmin
      .rpc('count_outbox_by_status');

    // Fallback if RPC doesn't exist yet — count manually
    let summary = statusCounts;
    if (!summary) {
      const statuses = ['pending', 'processing', 'delivered', 'failed', 'dead_letter'];
      summary = {};
      for (const s of statuses) {
        const { count } = await supabaseAdmin
          .from('event_outbox')
          .select('id', { count: 'exact', head: true })
          .eq('status', s);
        (summary as Record<string, number>)[s] = count ?? 0;
      }
    }

    const response = NextResponse.json({
      events: events || [],
      summary,
    });
    response.headers.set('X-Correlation-ID', correlationId);
    return response;
  }

  // ─── Default: operations summary ────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const [
    { count: todayReservations },
    { count: pendingOutbox },
    { count: failedOutbox },
    { data: recentPickups },
  ] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('date', today)
      .in('status', ['confirmed', 'locked']),
    supabaseAdmin
      .from('event_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('event_outbox')
      .select('id', { count: 'exact', head: true })
      .in('status', ['failed', 'dead_letter']),
    supabaseAdmin
      .from('pickup_events')
      .select('id')
      .gte('created_at', `${today}T00:00:00`)
      .limit(100),
  ]);

  const response = NextResponse.json({
    date: today,
    todayReservations: todayReservations ?? 0,
    todayPickups: recentPickups?.length ?? 0,
    pendingOutboxEvents: pendingOutbox ?? 0,
    failedOutboxEvents: failedOutbox ?? 0,
  });
  response.headers.set('X-Correlation-ID', correlationId);
  return response;
}
