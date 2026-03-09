import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, notFound, verifyGuardianAccess } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

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

  // Verify guardian access to this child
  const guardian = await verifyGuardianAccess(auth.userId, childId);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  // Fetch child details (access already verified above)
  const { data: child, error: childError } = await supabaseAdmin
    .from('children')
    .select('id, parent_id, first_name, last_name, date_of_birth, medical_notes, created_at, updated_at')
    .eq('id', childId)
    .single();

  if (childError || !child) return notFound('Child not found');

  // Fetch related data in parallel
  const [allergiesRes, contactsRes, pickupsRes, medicalRes] = await Promise.all([
    supabaseAdmin
      .from('child_allergies')
      .select('*, child_allergy_action_plans(*)')
      .eq('child_id', childId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('child_emergency_contacts')
      .select('id, child_id, first_name, last_name, relationship, phone, phone_alt, email, is_primary, priority, authorized_for_pickup, created_at, updated_at')
      .eq('child_id', childId)
      .order('priority', { ascending: true }),
    supabaseAdmin
      .from('child_authorized_pickups')
      .select('id, child_id, first_name, last_name, relationship, phone, email, is_emergency_contact, is_active, id_verified, id_verified_at, notes, created_at, updated_at')
      .eq('child_id', childId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('child_medical_profiles')
      .select('*')
      .eq('child_id', childId)
      .single(),
  ]);

  if (allergiesRes.error) return badRequest('Failed to load allergies');
  if (contactsRes.error) return badRequest('Failed to load emergency contacts');
  if (pickupsRes.error) return badRequest('Failed to load authorized pickups');
  // medical profile might not exist yet — that's OK

  return NextResponse.json({
    ...child,
    allergies: allergiesRes.data || [],
    emergency_contacts: contactsRes.data || [],
    authorized_pickups: pickupsRes.data || [],
    medical_profile: medicalRes.data || null,
  });
}
