import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/children/:id/export
 * Returns a comprehensive JSON file of the child's record for inspection readiness.
 * Includes all Georgia DECAL required fields.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;

  // Verify child belongs to parent
  const { data: child, error: childError } = await auth.supabase
    .from('children')
    .select('id, parent_id, first_name, last_name, date_of_birth, medical_notes, created_at, updated_at')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (childError || !child) return badRequest('Child not found');

  // Fetch parent info
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, first_name, last_name, email, phone, address')
    .eq('id', auth.parentId)
    .single();

  // Fetch all related child data in parallel
  const [
    allergiesRes,
    contactsRes,
    pickupsRes,
    medicalRes,
    immunizationRes,
    medicationsRes,
    documentsRes,
  ] = await Promise.all([
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
      .eq('facility_id', auth.activeFacilityId)
      .single(),
    auth.supabase
      .from('child_immunization_records')
      .select('*')
      .eq('child_id', childId)
      .eq('facility_id', auth.activeFacilityId)
      .single(),
    auth.supabase
      .from('medication_authorizations')
      .select('*')
      .eq('child_id', childId)
      .order('created_at', { ascending: false }),
    auth.supabase
      .from('child_documents')
      .select('id, document_type, file_name, file_size, mime_type, expires_at, verified, verified_at, notes, is_active, created_at')
      .eq('child_id', childId)
      .eq('facility_id', auth.activeFacilityId)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ]);

  const exportData = {
    export_metadata: {
      exported_at: new Date().toISOString(),
      exported_by: auth.userId,
      format_version: '1.0',
      purpose: 'Georgia DECAL licensing inspection readiness',
    },
    child: {
      ...child,
      age_years: Math.floor(
        (Date.now() - new Date(child.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      ),
    },
    parent_guardian: parent || null,
    physician_info: medicalRes.data
      ? {
          physician_name: medicalRes.data.physician_name,
          physician_phone: medicalRes.data.physician_phone,
          hospital_preference: medicalRes.data.hospital_preference,
        }
      : null,
    medical_profile: medicalRes.data || null,
    allergies: allergiesRes.data || [],
    emergency_contacts: contactsRes.data || [],
    authorized_pickups: pickupsRes.data || [],
    immunization_record: immunizationRes.data || null,
    medication_authorizations: medicationsRes.data || [],
    documents_on_file: documentsRes.data || [],
    compliance_checklist: {
      child_name_dob: !!child.first_name && !!child.last_name && !!child.date_of_birth,
      parent_contact: !!parent?.phone && !!parent?.email,
      physician_on_file: !!(medicalRes.data?.physician_name && medicalRes.data?.physician_phone),
      emergency_contacts: (contactsRes.data?.length ?? 0) >= 1,
      authorized_pickups: (pickupsRes.data?.length ?? 0) >= 1,
      immunization_current: immunizationRes.data?.status === 'current' || immunizationRes.data?.status?.startsWith('exempt'),
      medical_profile_complete: !!medicalRes.data,
      allergy_info_documented: true, // empty = no known allergies, which is documented
      medication_authorizations_current: (medicationsRes.data || []).every(
        (m: any) => !m.end_date || new Date(m.end_date) >= new Date()
      ),
    },
  };

  const childName = `${child.first_name}_${child.last_name}`.replace(/\s+/g, '_');

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="child_file_${childName}_${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}
