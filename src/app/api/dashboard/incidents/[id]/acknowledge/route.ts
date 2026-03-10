import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { acknowledgeIncidentByParent } from '@/lib/incident-case-files';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth?.activeFacilityId) return unauthorized();

  const { id } = await params;
  try {
    await acknowledgeIncidentByParent({ incidentId: id, facilityId: auth.activeFacilityId, parentId: auth.parentId });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return badRequest(e?.message || 'Unable to acknowledge incident');
  }
}
