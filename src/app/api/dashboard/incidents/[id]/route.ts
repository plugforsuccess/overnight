import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized } from '@/lib/api-auth';
import { loadIncidentCaseFileDetail } from '@/lib/incident-case-files';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth?.activeFacilityId) return unauthorized();

  const { id } = await params;
  try {
    const detail = await loadIncidentCaseFileDetail(id, auth.activeFacilityId);
    if (detail.caseFile.parent_id !== auth.parentId) return unauthorized();

    return NextResponse.json({
      incident: {
        id: detail.incident.id,
        summary: detail.incident.summary,
        details: detail.incident.details,
        category: detail.incident.category,
        severity: detail.incident.severity,
        created_at: detail.incident.created_at,
      },
      caseFile: {
        id: detail.caseFile.id,
        status: detail.caseFile.status,
        parent_notified: detail.caseFile.parent_notified,
        parent_notified_at: detail.caseFile.parent_notified_at,
        parent_acknowledged: detail.caseFile.parent_acknowledged,
        parent_acknowledged_at: detail.caseFile.parent_acknowledged_at,
        resolution_summary: detail.caseFile.resolution_summary,
      },
      actions: detail.actions.filter((a: any) => ['PARENT_NOTIFIED', 'PARENT_ACKNOWLEDGED', 'STATUS_CHANGED'].includes(a.action_type)).map((a: any) => ({
        id: a.id,
        action_type: a.action_type,
        action_label: a.action_label,
        created_at: a.created_at,
      })),
      timeline: detail.careEvents,
      guidance: 'If you have questions, contact your facility administrator for follow-up.',
    });
  } catch {
    return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  }
}
