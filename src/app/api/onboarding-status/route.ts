import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { onboardingStatusSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

// Valid state transitions — only allow forward progression
const VALID_TRANSITIONS: Record<string, string[]> = {
  started: ['parent_profile_complete'],
  parent_profile_complete: ['child_created'],
  child_created: ['medical_ack_complete'],
  medical_ack_complete: ['emergency_contact_added'],
  emergency_contact_added: ['complete'],
  complete: [],
};

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('onboarding_status')
    .eq('id', auth.parentId)
    .single();

  if (!parent) return badRequest('Parent not found');
  return NextResponse.json({ onboarding_status: parent.onboarding_status });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = onboardingStatusSchema.safeParse(body.status);
  if (!parsed.success) {
    return badRequest('Invalid onboarding status');
  }

  const newStatus = parsed.data;

  // Get current status
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('onboarding_status')
    .eq('id', auth.parentId)
    .single();

  if (!parent) return badRequest('Parent not found');

  const currentStatus = parent.onboarding_status;

  // Validate transition
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return badRequest(`Cannot transition from '${currentStatus}' to '${newStatus}'`);
  }

  // For 'complete' status, verify all requirements are met
  if (newStatus === 'complete') {
    const [childrenRes, ecRes, medRes] = await Promise.all([
      supabaseAdmin
        .from('children')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', auth.parentId),
      Promise.resolve(supabaseAdmin.rpc('count_emergency_contacts_for_parent', { p_parent_id: auth.parentId })).catch(() => null),
      supabaseAdmin
        .from('children')
        .select('id, child_medical_profiles(id)')
        .eq('parent_id', auth.parentId),
    ]);

    if ((childrenRes.count ?? 0) < 1) {
      return badRequest('At least one child is required to complete onboarding');
    }

    // Check emergency contacts exist for at least one child
    const childrenWithData = medRes.data || [];
    const childIds = childrenWithData.map((c: any) => c.id);

    if (childIds.length > 0) {
      const { count: ecCount } = await supabaseAdmin
        .from('child_emergency_contacts')
        .select('id', { count: 'exact', head: true })
        .in('child_id', childIds);

      if ((ecCount ?? 0) < 1) {
        return badRequest('At least one emergency contact is required to complete onboarding');
      }
    }

    // Check medical profiles exist for all children
    const childrenWithoutMedical = childrenWithData.filter(
      (c: any) => !c.child_medical_profiles || c.child_medical_profiles.length === 0
    );
    if (childrenWithoutMedical.length > 0) {
      return badRequest('Medical acknowledgement is required for all children');
    }
  }

  const { error } = await supabaseAdmin
    .from('parents')
    .update({ onboarding_status: newStatus })
    .eq('id', auth.parentId);

  if (error) return badRequest('Failed to update onboarding status');
  return NextResponse.json({ onboarding_status: newStatus });
}
