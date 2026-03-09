import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound } from '@/lib/api-auth';
import { medicationAuthorizationSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: medId } = await params;

  // Verify the medication belongs to a child owned by this parent
  const { data: med } = await supabaseAdmin
    .from('medication_authorizations')
    .select('id, child_id')
    .eq('id', medId)
    .single();

  if (!med) return notFound('Medication authorization not found');

  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', med.child_id)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return notFound('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = medicationAuthorizationSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await supabaseAdmin
    .from('medication_authorizations')
    .update({
      ...parsed.data,
      parent_consent_signed_at: new Date().toISOString(),
    })
    .eq('id', medId)
    .select()
    .single();

  if (error) return badRequest(error.message);
  return NextResponse.json({ medication: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: medId } = await params;

  // Verify ownership
  const { data: med } = await supabaseAdmin
    .from('medication_authorizations')
    .select('id, child_id')
    .eq('id', medId)
    .single();

  if (!med) return notFound('Medication authorization not found');

  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', med.child_id)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return notFound('Child not found');

  // Soft delete — deactivate rather than remove (preserve audit trail)
  const { error } = await supabaseAdmin
    .from('medication_authorizations')
    .update({ is_active: false })
    .eq('id', medId);

  if (error) return badRequest(error.message);

  // Log to child_events
  await supabaseAdmin.from('child_events').insert({
    child_id: med.child_id,
    event_type: 'medication_deauthorized',
    event_data: { authorization_id: medId },
    created_by: auth.userId,
  });

  return NextResponse.json({ success: true });
}
