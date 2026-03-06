import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound } from '@/lib/api-auth';

/**
 * GET /api/children/:id/details
 * Fetches a child with all related data (allergies, action plans, contacts, pickups).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const childId = params.id;

  // Verify child belongs to parent
  const { data: child, error: childError } = await auth.supabase
    .from('children')
    .select('id, parent_id, first_name, last_name, date_of_birth, medical_notes, created_at, updated_at')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .single();

  if (childError || !child) return notFound('Child not found');

  // Fetch related data in parallel
  const [allergiesRes, contactsRes, pickupsRes] = await Promise.all([
    auth.supabase
      .from('child_allergies')
      .select('*, child_allergy_action_plans(*)')
      .eq('child_id', childId)
      .order('created_at', { ascending: true }),
    auth.supabase
      .from('child_emergency_contacts')
      .select('id, child_id, first_name, last_name, relationship, phone, phone_alt, priority, authorized_for_pickup, created_at, updated_at')
      .eq('child_id', childId)
      .order('priority', { ascending: true }),
    auth.supabase
      .from('child_authorized_pickups')
      .select('id, child_id, first_name, last_name, relationship, phone, id_verified, id_verified_at, notes, created_at, updated_at')
      .eq('child_id', childId)
      .order('created_at', { ascending: true }),
  ]);

  if (allergiesRes.error) return badRequest('Failed to load allergies');
  if (contactsRes.error) return badRequest('Failed to load emergency contacts');
  if (pickupsRes.error) return badRequest('Failed to load authorized pickups');

  return NextResponse.json({
    ...child,
    allergies: allergiesRes.data || [],
    emergency_contacts: contactsRes.data || [],
    authorized_pickups: pickupsRes.data || [],
  });
}
