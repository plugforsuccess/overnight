import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound } from '@/lib/api-auth';

/**
 * GET /api/children/:id/details
 * Fetches a child with all related data (allergies, action plans, contacts,
 * pickups, immunization record, medication authorizations).
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
  const [allergiesRes, contactsRes, pickupsRes, medicalRes, immunizationRes, medicationsRes] = await Promise.all([
    auth.supabase
      .from('child_allergies')
      .select('*, child_allergy_action_plans(*)')
      .eq('child_id', childId)
      .order('created_at', { ascending: true }),
    auth.supabase
      .from('child_emergency_contacts')
      .select('id, child_id, first_name, last_name, relationship, phone, phone_alt, email, is_primary, priority, authorized_for_pickup, created_at, updated_at')
      .eq('child_id', childId)
      .order('priority', { ascending: true }),
    auth.supabase
      .from('child_authorized_pickups')
      .select('id, child_id, first_name, last_name, relationship, phone, email, is_emergency_contact, is_active, id_verified, id_verified_at, notes, created_at, updated_at')
      .eq('child_id', childId)
      .order('created_at', { ascending: true }),
    auth.supabase
      .from('child_medical_profiles')
      .select('*')
      .eq('child_id', childId)
      .single(),
    auth.supabase
      .from('child_immunization_records')
      .select('*')
      .eq('child_id', childId)
      .single(),
    auth.supabase
      .from('medication_authorizations')
      .select('*')
      .eq('child_id', childId)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  if (allergiesRes.error) return badRequest('Failed to load allergies');
  if (contactsRes.error) return badRequest('Failed to load emergency contacts');
  if (pickupsRes.error) return badRequest('Failed to load authorized pickups');
  // medical profile, immunization record might not exist yet -- that's OK

  return NextResponse.json({
    ...child,
    allergies: allergiesRes.data || [],
    emergency_contacts: contactsRes.data || [],
    authorized_pickups: pickupsRes.data || [],
    medical_profile: medicalRes.data || null,
    immunization_record: immunizationRes.data || null,
    medication_authorizations: medicationsRes.data || [],
  });
}
