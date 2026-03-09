import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getChildComplianceStatus } from '@/lib/children/compliance';

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const filter = req.nextUrl.searchParams.get('filter');

  const { data: children, error } = await supabaseAdmin
    .from('children')
    .select('id, first_name, last_name, updated_at, parent:parents(first_name,last_name)')
    .eq('facility_id', admin.activeFacilityId)
    .eq('active', true)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await Promise.all((children || []).map(async (child: any) => {
    const status = await getChildComplianceStatus(child.id, admin.activeFacilityId!);
    return {
      childId: child.id,
      childName: `${child.first_name} ${child.last_name}`,
      guardian: `${child.parent?.first_name || ''} ${child.parent?.last_name || ''}`.trim(),
      bookingEligibility: status.eligibleToBook,
      immunizationStatus: status.immunizationStatus,
      allergyPlanStatus: status.hasRequiredAllergyPlan,
      physicianInfoStatus: status.hasPhysicianInfo,
      medicationStatus: status.hasValidMedicationAuthorization,
      documentStatus: status.warnings.includes('Documents awaiting admin review') ? 'unverified' : 'ok',
      blockers: status.blockers,
      warnings: status.warnings,
      updatedAt: child.updated_at,
    };
  }));

  const filtered = rows.filter((row) => {
    if (!filter) return true;
    switch (filter) {
      case 'missing_emergency_contact': return row.blockers.some((b: string) => b.includes('emergency contact'));
      case 'missing_pickup': return row.blockers.some((b: string) => b.includes('authorized pickup'));
      case 'missing_medical_profile': return row.blockers.some((b: string) => b.includes('medical profile'));
      case 'missing_physician_info': return row.blockers.some((b: string) => b.includes('physician'));
      case 'missing_immunization': return row.immunizationStatus === 'missing';
      case 'expired_immunization': return row.immunizationStatus === 'expired';
      case 'missing_allergy_plan': return row.blockers.some((b: string) => b.includes('allergy action plan'));
      case 'expired_medication_auth': return row.blockers.some((b: string) => b.includes('medication authorization'));
      case 'unverified_documents': return row.documentStatus === 'unverified';
      default: return true;
    }
  });

  return NextResponse.json({ children: filtered });
}
