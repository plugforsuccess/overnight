import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
import { authorizedPickupSchema } from '@/lib/validation/children';
import { hashPin } from '@/lib/pin-hash';

/**
 * GET /api/children/:id/authorized-pickups
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return notFound('Child not found');

  // Never return pickup_pin_hash
  const { data, error } = await auth.supabase
    .from('child_authorized_pickups')
    .select('id, child_id, first_name, last_name, relationship, phone, id_verified, id_verified_at, notes, created_at, updated_at')
    .eq('child_id', childId)
    .order('created_at', { ascending: true });

  if (error) return badRequest(error.message);
  return NextResponse.json({ pickups: data || [] });
}

/**
 * POST /api/children/:id/authorized-pickups
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return notFound('Child not found');

  // Enforce max 10 authorized pickups per child
  const { count: pickupCount } = await auth.supabase
    .from('child_authorized_pickups')
    .select('*', { count: 'exact', head: true })
    .eq('child_id', childId);

  if ((pickupCount ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Maximum of 10 authorized pickups allowed per child. Please remove one before adding another.' },
      { status: 422 }
    );
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = authorizedPickupSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const pinHash = await hashPin(parsed.data.pickup_pin);

  const { data, error } = await auth.supabase
    .from('child_authorized_pickups')
    .insert({
      child_id: childId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      relationship: parsed.data.relationship,
      phone: parsed.data.phone.replace(/\D/g, ''),
      pickup_pin_hash: pinHash,
      notes: parsed.data.notes || null,
    })
    .select('id, child_id, first_name, last_name, relationship, phone, id_verified, id_verified_at, notes, created_at, updated_at')
    .single();

  if (error) return badRequest(error.message);

  await logAuditEvent(auth.supabase, auth.userId, 'add_authorized_pickup', 'child_authorized_pickup', data.id, {
    child_id: childId,
  });

  return NextResponse.json({ pickup: data });
}
