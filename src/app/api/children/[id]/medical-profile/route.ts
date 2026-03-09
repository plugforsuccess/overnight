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

  // Verify child belongs to parent
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

  const parsed = medicalProfileSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const profileData = {
    child_id: childId,
    ...parsed.data,
  };

  // Upsert — create or update
  const { data: existing } = await supabaseAdmin
    .from('child_medical_profiles')
    .select('id')
    .eq('child_id', childId)
    .single();

  let result;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('child_medical_profiles')
      .update(parsed.data)
      .eq('child_id', childId)
      .select()
      .single();
    if (error) return badRequest(error.message);
    result = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from('child_medical_profiles')
      .insert(profileData)
      .select()
      .single();
    if (error) return badRequest(error.message);
    result = data;
  }

  return NextResponse.json({ profile: result });
}
