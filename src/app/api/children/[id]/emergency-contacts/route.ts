import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent, verifyGuardianAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { emergencyContactSchema } from '@/lib/validation/children';
import { hashPin } from '@/lib/pin-hash';

/**
 * GET /api/children/:id/emergency-contacts
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const { data, error } = await supabaseAdmin
    .from('child_emergency_contacts')
    .select('id, child_id, first_name, last_name, relationship, phone, phone_alt, priority, authorized_for_pickup, created_at, updated_at')
    .eq('child_id', childId)
    .order('priority', { ascending: true });

  if (error) return badRequest(error.message);
  return NextResponse.json({ contacts: data || [] });
}

/**
 * POST /api/children/:id/emergency-contacts
 * Add an emergency contact (DB enforces max 2).
 * If authorized_for_pickup is true and pickup_pin is provided,
 * auto-creates an authorized pickup record with the hashed PIN.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

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

  // Extract pickup_pin before Zod validation (it's not in the schema)
  const pickupPin: string | undefined = body.pickup_pin;
  const parsed = emergencyContactSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  // If authorized_for_pickup, require a valid pickup_pin
  if (parsed.data.authorized_for_pickup && (!pickupPin || !/^\d{4,6}$/.test(pickupPin))) {
    return NextResponse.json(
      { error: 'A 4-6 digit pickup PIN is required when authorizing for pickup.' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('child_emergency_contacts')
    .insert({
      child_id: childId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      relationship: parsed.data.relationship,
      phone: parsed.data.phone.replace(/\D/g, ''),
      phone_alt: parsed.data.phone_alt || null,
      priority: parsed.data.priority,
      authorized_for_pickup: parsed.data.authorized_for_pickup,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('Max 2 emergency contacts')) {
      return NextResponse.json(
        { error: 'Maximum of 2 emergency contacts allowed per child. Please remove one before adding another.' },
        { status: 422 }
      );
    }
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      return NextResponse.json(
        { error: 'An emergency contact with this priority already exists. Use priority 1 or 2.' },
        { status: 422 }
      );
    }
    return badRequest('Failed to add emergency contact');
  }

  await logAuditEvent(supabaseAdmin, auth.userId, 'add_emergency_contact', 'child_emergency_contact', data.id, {
    child_id: childId,
  });

  // Auto-create authorized pickup record when toggle is checked
  let pickup = null;
  if (parsed.data.authorized_for_pickup && pickupPin) {
    const pinHash = await hashPin(pickupPin);

    const { data: pickupData, error: pickupError } = await supabaseAdmin
      .from('child_authorized_pickups')
      .insert({
        child_id: childId,
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name,
        relationship: parsed.data.relationship,
        phone: parsed.data.phone.replace(/\D/g, ''),
        pickup_pin_hash: pinHash,
        notes: `Auto-created from emergency contact (priority ${parsed.data.priority})`,
      })
      .select('id, child_id, first_name, last_name, relationship, phone, id_verified, id_verified_at, notes, created_at, updated_at')
      .single();

    if (!pickupError && pickupData) {
      pickup = pickupData;
      await logAuditEvent(supabaseAdmin, auth.userId, 'add_authorized_pickup', 'child_authorized_pickup', pickupData.id, {
        child_id: childId,
        promoted_from_emergency_contact: data.id,
      });
    }
  }

  return NextResponse.json({ contact: data, pickup });
}
