import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

const DEFAULT_TIMELINE_WINDOW_HOURS = 12;

export async function ensureIncidentCaseFile(incidentId: string) {
  const { data: existing } = await supabaseAdmin
    .from('incident_case_files')
    .select('id')
    .eq('incident_id', incidentId)
    .maybeSingle();

  if (existing?.id) return existing;

  const { data: incident, error: incidentError } = await supabaseAdmin
    .from('incident_reports')
    .select('id, facility_id, child_id, severity, category')
    .eq('id', incidentId)
    .single();

  if (incidentError || !incident) throw new Error('Incident not found');

  const { data: facility, error: facilityError } = await supabaseAdmin
    .from('facilities')
    .select('organization_id')
    .eq('id', incident.facility_id)
    .single();
  if (facilityError || !facility) throw new Error('Facility not found');

  const { data: child } = await supabaseAdmin
    .from('children')
    .select('parent_id')
    .eq('id', incident.child_id)
    .maybeSingle();

  const { data: created, error } = await supabaseAdmin
    .from('incident_case_files')
    .insert({
      organization_id: facility.organization_id,
      facility_id: incident.facility_id,
      incident_id: incident.id,
      child_id: incident.child_id,
      parent_id: child?.parent_id ?? null,
      severity: incident.severity ?? null,
      category: incident.category ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return created;
}

export async function loadIncidentCaseFileDetail(incidentId: string, facilityId: string, windowHours = DEFAULT_TIMELINE_WINDOW_HOURS) {
  await ensureIncidentCaseFile(incidentId);

  const { data: incident, error: incidentError } = await supabaseAdmin
    .from('incident_reports')
    .select('*, child:children(id, first_name, last_name, parent_id, parent:parents(id, first_name, last_name, email)), attendance_session:child_attendance_sessions(id, status, check_in_at, check_out_at), pickup:pickup_verifications(id, verified_name, verified_relationship, verified_at)')
    .eq('id', incidentId)
    .eq('facility_id', facilityId)
    .single();

  if (incidentError || !incident) throw new Error('Incident not found in facility scope');

  const { data: caseFile, error: caseError } = await supabaseAdmin
    .from('incident_case_files')
    .select('*')
    .eq('incident_id', incidentId)
    .eq('facility_id', facilityId)
    .single();

  if (caseError || !caseFile) throw new Error('Case file not found');

  const incidentAt = new Date(incident.created_at);
  const start = new Date(incidentAt.getTime() - windowHours * 3600 * 1000).toISOString();
  const end = new Date(incidentAt.getTime() + windowHours * 3600 * 1000).toISOString();

  const [{ data: notes }, { data: actions }, { data: careEvents }] = await Promise.all([
    supabaseAdmin
      .from('incident_case_notes')
      .select('*')
      .eq('case_file_id', caseFile.id)
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('incident_case_actions')
      .select('*')
      .eq('case_file_id', caseFile.id)
      .eq('facility_id', facilityId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('care_events')
      .select('id, event_type, event_summary, event_metadata, actor_type, actor_label, created_at')
      .eq('facility_id', facilityId)
      .eq('child_id', incident.child_id)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }),
  ]);

  return {
    caseFile,
    incident,
    notes: notes || [],
    actions: actions || [],
    careEvents: careEvents || [],
    timelineWindow: { start, end, windowHours },
  };
}

export async function markParentNotified(input: {
  incidentId: string;
  facilityId: string;
  actorUserId: string;
  actorType: 'FACILITY_ADMIN' | 'STAFF' | 'ORG_ADMIN' | 'PLATFORM_ADMIN';
}) {
  const detail = await loadIncidentCaseFileDetail(input.incidentId, input.facilityId);
  const notifiedAt = new Date().toISOString();

  await supabaseAdmin.from('incident_case_files').update({
    parent_notified: true,
    parent_notified_at: notifiedAt,
    status: detail.caseFile.status === 'OPEN' ? 'PARENT_NOTIFIED' : detail.caseFile.status,
  }).eq('id', detail.caseFile.id);

  await supabaseAdmin.from('incident_case_actions').insert({
    organization_id: detail.caseFile.organization_id,
    facility_id: detail.caseFile.facility_id,
    case_file_id: detail.caseFile.id,
    action_type: 'PARENT_NOTIFIED',
    action_label: 'Parent notified',
    action_metadata: { notified_at: notifiedAt },
    performed_by: input.actorUserId,
  });

  await writeCareEvent({
    eventType: 'parent_notified',
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    facilityId: detail.caseFile.facility_id,
    organizationId: detail.caseFile.organization_id,
    childId: detail.caseFile.child_id,
    parentId: detail.caseFile.parent_id,
    incidentId: input.incidentId,
    metadata: { case_file_id: detail.caseFile.id, notified_at: notifiedAt },
  });
}

export async function acknowledgeIncidentByParent(input: { incidentId: string; facilityId: string; parentId: string }) {
  const { data: ackRows, error: ackError } = await supabaseAdmin.rpc('parent_acknowledge_incident_case_file', {
    p_incident_id: input.incidentId,
    p_facility_id: input.facilityId,
    p_actor_user_id: input.parentId,
  });

  if (ackError) throw ackError;
  const ack = (ackRows || [])[0];
  if (!ack) throw new Error('Incident acknowledgement failed');

  const acknowledgedAt = ack.acknowledged_at;

  await writeCareEvent({
    eventType: 'incident_acknowledged_by_parent',
    actorType: 'PARENT',
    actorUserId: input.parentId,
    facilityId: ack.facility_id,
    organizationId: ack.organization_id,
    childId: ack.child_id,
    parentId: ack.parent_id,
    incidentId: input.incidentId,
    metadata: { case_file_id: ack.case_file_id, acknowledged_at: acknowledgedAt },
  });
}
