import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, logAuditEvent } from '@/lib/api-auth';
import { emergencyContactSchema } from '@/lib/validation/children';

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

  // Verify child ownership
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return notFound('Child not found');

  const { data, error } = await auth.supabase
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
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

  // Verify child ownership
  const { data: child } = await auth.supabase
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (!child) return notFound('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = emergencyContactSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors.map(e => e.message).join(', '));
  }

  const { data, error } = await auth.supabase
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

  await logAuditEvent(auth.supabase, auth.userId, 'add_emergency_contact', 'child_emergency_contact', data.id, {
    child_id: childId,
  });

  return NextResponse.json({ contact: data });
}
