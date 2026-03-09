import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { immunizationRecordSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return badRequest('Child not found');

  const { data: record, error } = await auth.supabase
    .from('child_immunization_records')
    .select('*')
    .eq('child_id', childId)
    .single();

  if (error && error.code !== 'PGRST116') return badRequest('Failed to load immunization record');
  return NextResponse.json({ record: record || null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return badRequest('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = immunizationRecordSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const recordData = {
    child_id: childId,
    ...parsed.data,
  };

  // Upsert — one immunization record per child
  const { data: existing } = await supabaseAdmin
    .from('child_immunization_records')
    .select('id')
    .eq('child_id', childId)
    .single();

  let result;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('child_immunization_records')
      .update(parsed.data)
      .eq('child_id', childId)
      .select()
      .single();
    if (error) return badRequest(error.message);
    result = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('child_immunization_records')
      .insert(recordData)
      .select()
      .single();
    if (error) return badRequest(error.message);
    result = data;
  }

  // Log to child_events
  await supabaseAdmin.from('child_events').insert({
    child_id: childId,
    event_type: 'immunization_record_updated',
    event_data: { status: parsed.data.status },
    created_by: auth.userId,
  });

  return NextResponse.json({ record: result });
}
