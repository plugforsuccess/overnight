import { NextRequest, NextResponse } from 'next/server';
import { checkOpsWriteAccess } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkOpsWriteAccess(req);
  if (!admin?.activeFacilityId || !admin.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from('child_assignments')
    .update({ released_at: new Date().toISOString() })
    .eq('id', id)
    .eq('facility_id', admin.activeFacilityId)
    .is('released_at', null)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCareEvent({
    eventType: 'child_assignment_released',
    actorType: 'STAFF',
    actorUserId: admin.id,
    facilityId: admin.activeFacilityId,
    organizationId: admin.activeOrganizationId,
    childId: data.child_id,
    metadata: { assignment_id: data.id, staff_user_id: data.staff_user_id },
  });

  return NextResponse.json({ assignment: data });
}
