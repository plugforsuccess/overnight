import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, verifyGuardianAccess, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authorizedPickupUpdateSchema } from '@/lib/validation/children';
import { hashPin } from '@/lib/pin-hash';

/**
 * PATCH /api/authorized-pickups/:id
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const pickupId = params.id;

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('child_authorized_pickups')
    .select('*, children!inner(id)')
    .eq('id', pickupId)
    .single();

  if (!existing) return notFound('Authorized pickup not found');
  const guardian = await verifyGuardianAccess(auth.userId, existing.children.id);
  if (!guardian) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', existing.children.id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = authorizedPickupUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const updateData: Record<string, unknown> = {
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    relationship: parsed.data.relationship,
    phone: parsed.data.phone.replace(/\D/g, ''),
    notes: parsed.data.notes || null,
  };

  // Only update PIN if provided (reset PIN action)
  if (parsed.data.pickup_pin) {
    updateData.pickup_pin_hash = await hashPin(parsed.data.pickup_pin);
  }

  const { data, error } = await auth.supabase
    .from('child_authorized_pickups')
    .update(updateData)
    .eq('id', pickupId)
    .select('id, child_id, first_name, last_name, relationship, phone, id_verified, id_verified_at, notes, created_at, updated_at')
    .single();

  if (error) return badRequest(error.message);

  await logAuditEvent(auth.supabase, auth.userId, 'update_authorized_pickup', 'child_authorized_pickup', pickupId, {
    pin_reset: !!parsed.data.pickup_pin,
  });

  return NextResponse.json({ pickup: data });
}

/**
 * DELETE /api/authorized-pickups/:id
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const pickupId = params.id;

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('child_authorized_pickups')
    .select('*, children!inner(id)')
    .eq('id', pickupId)
    .single();

  if (!existing) return notFound('Authorized pickup not found');
  const guardian = await verifyGuardianAccess(auth.userId, existing.children.id);
  if (!guardian) {
    // Fallback: parent_id check
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', existing.children.id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const { error } = await auth.supabase
    .from('child_authorized_pickups')
    .delete()
    .eq('id', pickupId);

  if (error) return badRequest(error.message);

  await logAuditEvent(auth.supabase, auth.userId, 'delete_authorized_pickup', 'child_authorized_pickup', pickupId, {});

  return NextResponse.json({ success: true });
}
