import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { medicalProfileSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { data: profile, error } = await auth.supabase
    .from('child_medical_profiles')
    .select('*')
    .eq('child_id', childId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (error && error.code !== 'PGRST116') return badRequest('Failed to load medical profile');
  return NextResponse.json({ profile: profile || null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id, facility_id, parent_id')
    .eq('id', childId)
    .single();
  if (!child || child.parent_id !== auth.parentId || child.facility_id !== auth.activeFacilityId) {
    return badRequest('Child not found');
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = medicalProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Validation failed',
      issues: parsed.error.issues.map((e) => ({ path: e.path.join('.'), message: e.message })),
    }, { status: 400 });
  }

  const profileData = {
    child_id: childId,
    facility_id: child.facility_id,
    ...parsed.data,
  };

  const { data: result, error } = await supabaseAdmin
    .from('child_medical_profiles')
    .upsert(profileData, { onConflict: 'child_id,facility_id' })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to save medical profile', detail: error.message }, { status: 400 });
  }

  await supabaseAdmin.from('child_events').insert({
    child_id: childId,
    facility_id: child.facility_id,
    event_type: 'medical_profile_updated',
    event_data: {
      physician_name: !!parsed.data.physician_name,
      physician_phone: !!parsed.data.physician_phone,
    },
    created_by: auth.userId,
  });

  return NextResponse.json({ profile: result });
}
