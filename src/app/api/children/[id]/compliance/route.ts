import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { getChildComplianceStatus, getComplianceChecklist } from '@/lib/children/compliance';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  const { id: childId } = await params;

  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();
  if (!child) return badRequest('Child not found');

  const status = await getChildComplianceStatus(childId, auth.activeFacilityId);
  return NextResponse.json({ status, checklist: getComplianceChecklist(status) });
}
