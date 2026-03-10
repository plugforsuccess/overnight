import { NextRequest, NextResponse } from 'next/server';
import { checkOpsReadAccess, checkOpsWriteAccess } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

export async function GET(req: NextRequest) {
  const admin = await checkOpsReadAccess(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('staff_shifts')
    .select('*')
    .eq('facility_id', admin.activeFacilityId)
    .order('shift_start', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ shifts: data || [] });
}

export async function POST(req: NextRequest) {
  const admin = await checkOpsWriteAccess(req);
  if (!admin?.activeFacilityId || !admin.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.staff_user_id || !body?.shift_role || !body?.shift_start || !body?.shift_end) {
    return NextResponse.json({ error: 'staff_user_id, shift_role, shift_start, shift_end are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('staff_shifts')
    .insert({
      organization_id: admin.activeOrganizationId,
      facility_id: admin.activeFacilityId,
      staff_user_id: body.staff_user_id,
      shift_role: body.shift_role,
      shift_start: body.shift_start,
      shift_end: body.shift_end,
      is_active: body.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCareEvent({
    eventType: 'staff_shift_created',
    actorType: 'STAFF',
    actorUserId: admin.id,
    facilityId: admin.activeFacilityId,
    organizationId: admin.activeOrganizationId,
    metadata: { shift_id: data.id, shift_role: data.shift_role, staff_user_id: data.staff_user_id },
  });

  return NextResponse.json({ shift: data }, { status: 201 });
}
