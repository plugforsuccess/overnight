import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
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
  if (!auth.activeFacilityId) return unauthorized();

  const contactId = params.id;

  // Verify ownership: contact -> child -> parent
  const { data: existing } = await auth.supabase
    .from('child_emergency_contacts')
    .select('*, children!inner(parent_id)')
    .eq('id', contactId)
    .single();

  if (!existing || (existing as any).children?.parent_id !== auth.parentId) {
    return notFound('Emergency contact not found');
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
  if (!auth.activeFacilityId) return unauthorized();

  const contactId = params.id;

  // Verify ownership
  const { data: existing } = await auth.supabase
    .from('child_emergency_contacts')
    .select('*, children!inner(parent_id)')
    .eq('id', contactId)
    .single();

  if (!existing || (existing as any).children?.parent_id !== auth.parentId) {
    return notFound('Emergency contact not found');
  }

  const { error } = await auth.supabase
    .from('child_emergency_contacts')
    .delete()
    .eq('id', contactId);

  if (error) return badRequest(error.message);

  await logAuditEvent(auth.supabase, auth.userId, 'delete_emergency_contact', 'child_emergency_contact', contactId, {});

  return NextResponse.json({ success: true });
}
