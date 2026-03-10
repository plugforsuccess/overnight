import { NextRequest, NextResponse } from 'next/server';
import { checkOpsReadAccess, checkOpsWriteAccess } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { writeCareEvent } from '@/lib/care-events';

export async function GET(req: NextRequest) {
  const admin = await checkOpsReadAccess(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('shift_handoff_notes')
    .select('*')
    .eq('facility_id', admin.activeFacilityId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notes: data || [] });
}

export async function POST(req: NextRequest) {
  const admin = await checkOpsWriteAccess(req);
  if (!admin?.activeFacilityId || !admin.activeOrganizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.shift_id || !body?.note) {
    return NextResponse.json({ error: 'shift_id and note are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('shift_handoff_notes')
    .insert({
      organization_id: admin.activeOrganizationId,
      facility_id: admin.activeFacilityId,
      shift_id: body.shift_id,
      staff_user_id: admin.id,
      note: body.note,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeCareEvent({
    eventType: 'shift_handoff_note_created',
    actorType: 'STAFF',
    actorUserId: admin.id,
    facilityId: admin.activeFacilityId,
    organizationId: admin.activeOrganizationId,
    metadata: { note_id: data.id, shift_id: data.shift_id },
  });

  return NextResponse.json({ note: data }, { status: 201 });
}
