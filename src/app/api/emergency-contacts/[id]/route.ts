import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, verifyGuardianAccess, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { emergencyContactSchema } from '@/lib/validation/children';

/**
 * PATCH /api/emergency-contacts/:id
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const contactId = params.id;

  // Verify ownership: contact -> child -> guardian/parent
  const { data: existing } = await supabaseAdmin
    .from('child_emergency_contacts')
    .select('*, children!inner(id)')
    .eq('id', contactId)
    .single();

  if (!existing) return notFound('Emergency contact not found');
  const guardian = await verifyGuardianAccess(auth.userId, existing.children.id);
  if (!guardian) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', existing.children.id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = emergencyContactSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await auth.supabase
    .from('child_emergency_contacts')
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      relationship: parsed.data.relationship,
      phone: parsed.data.phone.replace(/\D/g, ''),
      phone_alt: parsed.data.phone_alt || null,
      priority: parsed.data.priority,
      authorized_for_pickup: parsed.data.authorized_for_pickup,
    })
    .eq('id', contactId)
    .select()
    .single();

  if (error) return badRequest(error.message);

  await logAuditEvent(auth.supabase, auth.userId, 'update_emergency_contact', 'child_emergency_contact', contactId, {});

  return NextResponse.json({ contact: data });
}

/**
 * DELETE /api/emergency-contacts/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const contactId = params.id;

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('child_emergency_contacts')
    .select('*, children!inner(id)')
    .eq('id', contactId)
    .single();

  if (!existing) return notFound('Emergency contact not found');
  const guardian = await verifyGuardianAccess(auth.userId, existing.children.id);
  if (!guardian) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', existing.children.id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const { error } = await auth.supabase
    .from('child_emergency_contacts')
    .delete()
    .eq('id', contactId);

  if (error) return badRequest(error.message);

  await logAuditEvent(auth.supabase, auth.userId, 'delete_emergency_contact', 'child_emergency_contact', contactId, {});

  return NextResponse.json({ success: true });
}
