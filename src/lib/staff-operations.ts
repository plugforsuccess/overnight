import { supabaseAdmin } from '@/lib/supabase-server';

const OPEN_TASK_STATUSES = ['OPEN', 'IN_PROGRESS'];

export async function getChildrenInCare(facilityId: string) {
  const { data, error } = await supabaseAdmin
    .from('child_attendance_sessions')
    .select('id, child_id, status, check_in_at, notes, children!inner(id, first_name, last_name)')
    .eq('facility_id', facilityId)
    .in('status', ['checked_in', 'in_care', 'ready_for_pickup'])
    .order('check_in_at', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

export async function getExpectedArrivals(facilityId: string, date: string) {
  const { data, error } = await supabaseAdmin
    .from('reservation_nights')
    .select('id, care_date, status, child_id, reservation_id, children!inner(id, first_name, last_name)')
    .eq('facility_id', facilityId)
    .eq('care_date', date)
    .in('status', ['confirmed', 'pending'])
    .order('created_at', { ascending: true });

  if (error) throw error;

  const childIds = Array.from(new Set((data || []).map((r: any) => r.child_id)));
  if (childIds.length === 0) return [];

  const { data: attendance, error: attendanceError } = await supabaseAdmin
    .from('child_attendance_sessions')
    .select('child_id')
    .eq('facility_id', facilityId)
    .in('child_id', childIds)
    .in('status', ['checked_in', 'in_care', 'ready_for_pickup', 'checked_out']);

  if (attendanceError) throw attendanceError;
  const seenChildIds = new Set((attendance || []).map((a: any) => a.child_id));

  return (data || []).filter((r: any) => !seenChildIds.has(r.child_id));
}

export async function getReadyForPickupQueue(facilityId: string) {
  const { data, error } = await supabaseAdmin
    .from('child_attendance_sessions')
    .select('id, child_id, status, updated_at, pickup_person_name, children!inner(id, first_name, last_name)')
    .eq('facility_id', facilityId)
    .eq('status', 'ready_for_pickup')
    .order('updated_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getOpenIncidentAlerts(facilityId: string) {
  const { data, error } = await supabaseAdmin
    .from('incident_reports')
    .select('id, child_id, severity, category, summary, status, created_at, children!inner(id, first_name, last_name)')
    .eq('facility_id', facilityId)
    .in('status', ['open', 'investigating'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getPickupVerificationQueue(facilityId: string) {
  const { data, error } = await supabaseAdmin
    .from('child_attendance_sessions')
    .select('id, child_id, status, updated_at, children!inner(id, first_name, last_name), pickup_verifications(id, verified_at, verification_method)')
    .eq('facility_id', facilityId)
    .eq('status', 'ready_for_pickup')
    .order('updated_at', { ascending: true });

  if (error) throw error;
  return (data || []).filter((row: any) => !row.pickup_verifications || row.pickup_verifications.length === 0);
}

export async function getActiveShifts(facilityId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('staff_shifts')
    .select('id, staff_user_id, shift_role, shift_start, shift_end, is_active, created_at')
    .eq('facility_id', facilityId)
    .eq('is_active', true)
    .lte('shift_start', now)
    .gte('shift_end', now)
    .order('shift_start', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getOpenStaffTasks(facilityId: string) {
  const { data, error } = await supabaseAdmin
    .from('staff_tasks')
    .select('id, child_id, assigned_to, task_type, description, status, due_at, metadata, created_by, created_at, updated_at')
    .eq('facility_id', facilityId)
    .in('status', OPEN_TASK_STATUSES)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getOperationsDashboard(facilityId: string, date: string) {
  const [
    childrenInCare,
    expectedArrivals,
    readyForPickup,
    pickupVerificationQueue,
    openIncidents,
    activeShifts,
    openTasks,
    handoffNotes,
  ] = await Promise.all([
    getChildrenInCare(facilityId),
    getExpectedArrivals(facilityId, date),
    getReadyForPickupQueue(facilityId),
    getPickupVerificationQueue(facilityId),
    getOpenIncidentAlerts(facilityId),
    getActiveShifts(facilityId),
    getOpenStaffTasks(facilityId),
    supabaseAdmin
      .from('shift_handoff_notes')
      .select('id, shift_id, staff_user_id, note, created_at')
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
  ]);

  return {
    date,
    childrenInCare,
    expectedArrivals,
    readyForPickup,
    pickupVerificationQueue,
    openIncidents,
    activeShifts,
    handoffNotes,
    openTasks,
  };
}
