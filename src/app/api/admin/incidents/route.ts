import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

const SEVERITY_MAP: Record<string, string> = {
  // Reservation events
  reservation_night_created: 'info',
  reservation_night_confirmed: 'info',
  waitlist_promoted: 'info',
  reservation_night_cancelled: 'warning',
  // Attendance events
  child_checked_in: 'info',
  child_checked_out: 'info',
  attendance_status_corrected: 'warning',
  no_show_marked: 'warning',
  attendance_record_created: 'info',
  // Capacity events
  capacity_override_applied: 'warning',
  capacity_override_deactivated: 'info',
  night_closed: 'critical',
  night_reopened: 'info',
  capacity_reduced: 'warning',
};

function getSeverity(eventType: string): string {
  return SEVERITY_MAP[eventType] || 'info';
}

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get('start');
    const endDate = url.searchParams.get('end');
    const eventType = url.searchParams.get('event_type');
    const severity = url.searchParams.get('severity');
    const childId = url.searchParams.get('child_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Fetch from all three event sources in parallel
    const [resEvents, attEvents, capEvents] = await Promise.all([
      fetchReservationEvents(startDate, endDate, eventType, limit),
      fetchAttendanceEvents(startDate, endDate, eventType, childId, limit),
      fetchCapacityEvents(startDate, endDate, eventType, limit),
    ]);

    // Merge and sort by timestamp descending
    let events = [...resEvents, ...attEvents, ...capEvents];

    // Apply severity filter
    if (severity) {
      events = events.filter(e => e.severity === severity);
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Paginate
    const total = events.length;
    const paged = events.slice(offset, offset + limit);

    return NextResponse.json({
      events: paged,
      pagination: { total, limit, offset },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function fetchReservationEvents(
  startDate: string | null,
  endDate: string | null,
  eventType: string | null,
  limit: number
) {
  let query = supabaseAdmin
    .from('reservation_events')
    .select(`
      id, event_type, event_data, created_at, created_by,
      reservation:reservations(
        id,
        child:children(id, first_name, last_name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate + 'T23:59:59Z');
  if (eventType) query = query.eq('event_type', eventType);

  const { data } = await query;
  return (data || []).map((e: any) => ({
    event_id: e.id,
    event_type: e.event_type,
    child_id: e.reservation?.child?.id || null,
    child_name: e.reservation?.child
      ? `${e.reservation.child.first_name} ${e.reservation.child.last_name}`
      : null,
    timestamp: e.created_at,
    metadata: e.event_data,
    severity: getSeverity(e.event_type),
    source: 'reservation',
  }));
}

async function fetchAttendanceEvents(
  startDate: string | null,
  endDate: string | null,
  eventType: string | null,
  childId: string | null,
  limit: number
) {
  let query = supabaseAdmin
    .from('attendance_events')
    .select(`
      id, event_type, event_at, metadata, child_id, actor_user_id,
      child:children(id, first_name, last_name)
    `)
    .order('event_at', { ascending: false })
    .limit(limit);

  if (startDate) query = query.gte('event_at', startDate);
  if (endDate) query = query.lte('event_at', endDate + 'T23:59:59Z');
  if (eventType) query = query.eq('event_type', eventType);
  if (childId) query = query.eq('child_id', childId);

  const { data } = await query;
  return (data || []).map((e: any) => ({
    event_id: e.id,
    event_type: e.event_type,
    child_id: e.child_id,
    child_name: e.child
      ? `${e.child.first_name} ${e.child.last_name}`
      : null,
    timestamp: e.event_at,
    metadata: e.metadata,
    severity: getSeverity(e.event_type),
    source: 'attendance',
  }));
}

async function fetchCapacityEvents(
  startDate: string | null,
  endDate: string | null,
  eventType: string | null,
  limit: number
) {
  let query = supabaseAdmin
    .from('capacity_override_events')
    .select('id, event_type, event_at, metadata, care_date, actor_user_id')
    .order('event_at', { ascending: false })
    .limit(limit);

  if (startDate) query = query.gte('event_at', startDate);
  if (endDate) query = query.lte('event_at', endDate + 'T23:59:59Z');
  if (eventType) query = query.eq('event_type', eventType);

  const { data } = await query;
  return (data || []).map((e: any) => ({
    event_id: e.id,
    event_type: e.event_type,
    child_id: null,
    child_name: null,
    timestamp: e.event_at,
    metadata: { ...e.metadata, care_date: e.care_date },
    severity: getSeverity(e.event_type),
    source: 'capacity',
  }));
}
