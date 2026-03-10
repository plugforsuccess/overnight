import { NextRequest, NextResponse } from 'next/server';
import { checkOpsWriteAccess } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkOpsWriteAccess(req);
  if (!admin?.activeFacilityId || !admin.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const updates: any = {};
  if (body?.status) updates.status = body.status;
  if (typeof body?.description === 'string') updates.description = body.description;
  if (body?.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
  if (body?.due_at !== undefined) updates.due_at = body.due_at;
  if (body?.metadata !== undefined) updates.metadata = body.metadata;

  const { data, error } = await supabaseAdmin
    .from('staff_tasks')
    .update(updates)
    .eq('id', id)
    .eq('facility_id', admin.activeFacilityId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data.status === 'DONE') {
    await writeCareEvent({
      eventType: 'staff_task_completed',
      actorType: 'STAFF',
      actorUserId: admin.id,
      facilityId: admin.activeFacilityId,
      organizationId: admin.activeOrganizationId,
      childId: data.child_id,
      metadata: { task_id: data.id, task_type: data.task_type },
    });
  } else if (data.status === 'CANCELLED') {
    await writeCareEvent({
      eventType: 'staff_task_cancelled',
      actorType: 'STAFF',
      actorUserId: admin.id,
      facilityId: admin.activeFacilityId,
      organizationId: admin.activeOrganizationId,
      childId: data.child_id,
      metadata: { task_id: data.id, task_type: data.task_type },
    });
  }

  return NextResponse.json({ task: data });
}
