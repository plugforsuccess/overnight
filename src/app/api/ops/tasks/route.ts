import { NextRequest, NextResponse } from 'next/server';
import { checkOpsReadAccess, checkOpsWriteAccess } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

export async function GET(req: NextRequest) {
  const admin = await checkOpsReadAccess(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = supabaseAdmin
    .from('staff_tasks')
    .select('*')
    .eq('facility_id', admin.activeFacilityId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ tasks: data || [] });
}

export async function POST(req: NextRequest) {
  const admin = await checkOpsWriteAccess(req);
  if (!admin?.activeFacilityId || !admin.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.task_type || !body?.description) {
    return NextResponse.json({ error: 'task_type and description are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('staff_tasks')
    .insert({
      organization_id: admin.activeOrganizationId,
      facility_id: admin.activeFacilityId,
      child_id: body.child_id ?? null,
      assigned_to: body.assigned_to ?? null,
      task_type: body.task_type,
      description: body.description,
      status: body.status ?? 'OPEN',
      due_at: body.due_at ?? null,
      metadata: body.metadata ?? {},
      created_by: admin.id,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCareEvent({
    eventType: 'staff_task_created',
    actorType: 'STAFF',
    actorUserId: admin.id,
    facilityId: admin.activeFacilityId,
    organizationId: admin.activeOrganizationId,
    childId: data.child_id,
    metadata: { task_id: data.id, task_type: data.task_type, status: data.status },
  });

  return NextResponse.json({ task: data }, { status: 201 });
}
