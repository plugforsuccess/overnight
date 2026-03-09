import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { childBasicsSchema } from '@/lib/validation/children';
import { writeCareEvent } from '@/lib/care-events';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { data, error } = await auth.supabase
    .from('children')
    .select('id, parent_id, first_name, last_name, date_of_birth, medical_notes, created_at, updated_at')
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .eq('facility_id', auth.activeFacilityId)
    .order('created_at', { ascending: true });

  if (error) return badRequest(error.message);
  return NextResponse.json({ children: data });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = childBasicsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await auth.supabase
    .from('children')
    .insert({
      parent_id: auth.parentId,
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      date_of_birth: parsed.data.date_of_birth,
      medical_notes: parsed.data.medical_notes || null,
      facility_id: auth.activeFacilityId,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  await writeCareEvent({
    eventType: 'child_created',
    actorType: 'PARENT',
    actorUserId: auth.userId,
    facilityId: auth.activeFacilityId,
    childId: data.id,
    parentId: auth.parentId,
    metadata: { first_name: data.first_name, last_name: data.last_name },
  });

  return NextResponse.json({ child: data });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const { id, ...updates } = body;
  if (!id) return badRequest('Child ID is required');

  const parsed = childBasicsSchema.safeParse(updates);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await auth.supabase
    .from('children')
    .update({
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      date_of_birth: parsed.data.date_of_birth,
      medical_notes: parsed.data.medical_notes || null,
    })
    .eq('id', id)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .eq('facility_id', auth.activeFacilityId)
    .select()
    .single();

  if (error) return badRequest(error.message);

  await writeCareEvent({
    eventType: 'child_profile_updated',
    actorType: 'PARENT',
    actorUserId: auth.userId,
    facilityId: auth.activeFacilityId,
    childId: data.id,
    parentId: auth.parentId,
    metadata: { updated_fields: ['first_name', 'last_name', 'date_of_birth', 'medical_notes'] },
  });

  return NextResponse.json({ child: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return badRequest('Child ID is required');

  await writeCareEvent({
    eventType: 'record_archived',
    actorType: 'PARENT',
    actorUserId: auth.userId,
    facilityId: auth.activeFacilityId,
    childId: id,
    parentId: auth.parentId,
    metadata: { entity: 'child' },
  });

  const { error } = await auth.supabase
    .from('children')
    .delete()
    .eq('id', id)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .eq('facility_id', auth.activeFacilityId);

  if (error) return badRequest(error.message);
  return NextResponse.json({ success: true });
}
