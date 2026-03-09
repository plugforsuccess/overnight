import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { medicationAuthorizationSchema } from '@/lib/validation/children';
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

  const { data, error } = await auth.supabase
    .from('medication_authorizations')
    .select('*')
    .eq('child_id', childId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return badRequest('Failed to load medications');
  return NextResponse.json({ medications: data || [] });
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

  const parsed = medicationAuthorizationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await supabaseAdmin
    .from('medication_authorizations')
    .insert({
      child_id: childId,
      ...parsed.data,
      parent_consent_signed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  // Log to child_events
  await supabaseAdmin.from('child_events').insert({
    child_id: childId,
    event_type: 'medication_authorized',
    event_data: { medication_name: parsed.data.medication_name, authorization_id: data.id },
    created_by: auth.userId,
  });

  return NextResponse.json({ medication: data });
}
