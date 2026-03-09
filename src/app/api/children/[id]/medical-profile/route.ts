import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, verifyGuardianAccess } from '@/lib/api-auth';
import { medicalProfileSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { id: childId } = await params;

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const { data: profile, error } = await supabaseAdmin
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

  const { id: childId } = await params;

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

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
