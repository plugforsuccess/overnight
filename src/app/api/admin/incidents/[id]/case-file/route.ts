import { NextRequest, NextResponse } from 'next/server';
import { badRequest } from '@/lib/api-auth';
import { checkOrgReadAccess, checkFacilityStaffOrAdmin } from '@/lib/admin-auth';
import { loadIncidentCaseFileDetail, markParentNotified } from '@/lib/incident-case-files';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';
import { z } from 'zod';

const patchSchema = z.object({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'PARENT_NOTIFIED', 'RESOLVED', 'CLOSED']).optional(),
  parent_notified: z.boolean().optional(),
  resolution_summary: z.string().max(5000).nullable().optional(),
  resolved_at: z.string().datetime().nullable().optional(),
  closed_at: z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkOrgReadAccess(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const detail = await loadIncidentCaseFileDetail(id, admin.activeFacilityId);
    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: 'Case file not found' }, { status: 404 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkFacilityStaffOrAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map(i => i.message).join(', '));

  const detail = await loadIncidentCaseFileDetail(id, admin.activeFacilityId);

  if (parsed.data.parent_notified === true && !detail.caseFile.parent_notified) {
    await markParentNotified({
      incidentId: id,
      facilityId: admin.activeFacilityId,
      actorUserId: admin.id,
      actorType: 'FACILITY_ADMIN',
    });
  }

  const updates: Record<string, any> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.resolution_summary !== undefined) updates.resolution_summary = parsed.data.resolution_summary;
  if (parsed.data.resolved_at !== undefined) updates.resolved_at = parsed.data.resolved_at;
  if (parsed.data.closed_at !== undefined) updates.closed_at = parsed.data.closed_at;
  if (parsed.data.status === 'RESOLVED' && !updates.resolved_at) updates.resolved_at = new Date().toISOString();
  if (parsed.data.status === 'CLOSED' && !updates.closed_at) updates.closed_at = new Date().toISOString();

  const { data: caseFile, error } = await supabaseAdmin
    .from('incident_case_files')
    .update(updates)
    .eq('id', detail.caseFile.id)
    .eq('facility_id', admin.activeFacilityId)
    .select('*')
    .single();

  if (error) return badRequest(error.message);

  if (parsed.data.status) {
    await supabaseAdmin.from('incident_case_actions').insert({
      organization_id: caseFile.organization_id,
      facility_id: caseFile.facility_id,
      case_file_id: caseFile.id,
      action_type: 'STATUS_CHANGED',
      action_label: `Status set to ${parsed.data.status}`,
      action_metadata: { status: parsed.data.status },
      performed_by: admin.id,
    });
  }

  if (parsed.data.status === 'RESOLVED') {
    await writeCareEvent({
      eventType: 'incident_resolved',
      actorType: 'FACILITY_ADMIN',
      actorUserId: admin.id,
      facilityId: caseFile.facility_id,
      organizationId: caseFile.organization_id,
      childId: caseFile.child_id,
      parentId: caseFile.parent_id,
      incidentId: id,
      metadata: { case_file_id: caseFile.id },
    });
  }

  return NextResponse.json({ caseFile });
}
