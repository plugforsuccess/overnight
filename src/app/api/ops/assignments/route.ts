import { NextRequest, NextResponse } from 'next/server';
import { checkOpsWriteAccess } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

export async function POST(req: NextRequest) {
  const admin = await checkOpsWriteAccess(req);
  if (!admin?.activeFacilityId || !admin.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.child_id || !body?.staff_user_id) {
    return NextResponse.json({ error: 'child_id and staff_user_id are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('child_assignments')
    .insert({
      organization_id: admin.activeOrganizationId,
      facility_id: admin.activeFacilityId,
      child_id: body.child_id,
      staff_user_id: body.staff_user_id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCareEvent({
    eventType: 'child_assignment_created',
    actorType: 'STAFF',
    actorUserId: admin.id,
    facilityId: admin.activeFacilityId,
    organizationId: admin.activeOrganizationId,
    childId: data.child_id,
    metadata: { assignment_id: data.id, staff_user_id: data.staff_user_id },
  });

  return NextResponse.json({ assignment: data }, { status: 201 });
}
