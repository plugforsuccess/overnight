import { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileCompletion, CompletionSection, CompletionIssue } from './types';
import {
  evaluateParentRules,
  evaluateChildRules,
  evaluateBillingRules,
  type ParentData,
  type ChildData,
  type ChildAllergyData,
  type BillingData,
} from './rules';

/**
 * Centralized profile completion service.
 *
 * Computes the full completion state for a parent, including all children
 * and billing. Returns a structured object used by:
 * - Dashboard layout guard (redirect to /dashboard/complete-profile)
 * - Booking API guard (reject if incomplete)
 * - UI banners and checklists
 *
 * Uses supabaseAdmin (service role) to bypass RLS since this runs server-side.
 */
export async function getProfileCompletion(
  supabaseAdmin: SupabaseClient,
  parentId: string,
): Promise<ProfileCompletion> {
  // Fetch all required data in parallel
  const [parentRes, childrenRes, subscriptionsRes] = await Promise.all([
    supabaseAdmin
      .from('parents')
      .select('id, first_name, last_name, email, phone, address, stripe_customer_id')
      .eq('id', parentId)
      .single(),
    supabaseAdmin
      .from('children')
      .select(`
        id, first_name, last_name, date_of_birth, active, medical_notes,
        child_allergies(id, allergen, severity, child_allergy_action_plans(id, treatment_first_line)),
        child_emergency_contacts(id),
        child_authorized_pickups(id),
        child_medical_profiles(id)
      `)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('subscriptions')
      .select('id, status')
      .eq('parent_id', parentId)
      .in('status', ['active', 'past_due']),
  ]);

  // ─── Parent data ──────────────────────────────────────────────────────────────

  const parentData: ParentData = parentRes.data ?? {
    id: parentId,
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    address: null,
    stripe_customer_id: null,
  };

  const parentIssues = evaluateParentRules(parentData);

  // ─── Children data ────────────────────────────────────────────────────────────

  const childrenData: ChildData[] = (childrenRes.data || []).map((child: any) => {
    const allergies: ChildAllergyData[] = (child.child_allergies || []).map((a: any) => {
      const actionPlans = a.child_allergy_action_plans || [];
      return {
        id: a.id,
        allergen: a.allergen,
        severity: a.severity,
        has_action_plan: actionPlans.length > 0,
        action_plan_treatment: actionPlans.length > 0 ? actionPlans[0].treatment_first_line : null,
      };
    });

    return {
      id: child.id,
      first_name: child.first_name,
      last_name: child.last_name,
      date_of_birth: child.date_of_birth,
      active: child.active,
      allergies,
      emergency_contacts_count: (child.child_emergency_contacts || []).length,
      authorized_pickups_count: (child.child_authorized_pickups || []).length,
      has_medical_profile: (child.child_medical_profiles || []).length > 0,
      medical_notes: child.medical_notes,
    };
  });

  const childIssues = evaluateChildRules(childrenData);

  // ─── Billing data ─────────────────────────────────────────────────────────────

  const billingData: BillingData = {
    stripe_customer_id: parentData.stripe_customer_id,
    has_active_payment_method: !!parentData.stripe_customer_id,
    has_active_subscription: (subscriptionsRes.data || []).length > 0,
  };

  const billingIssues = evaluateBillingRules(billingData);

  // ─── Build sections ───────────────────────────────────────────────────────────

  const parentSection = buildSection(parentIssues);
  const childSection = buildSection(childIssues);
  const billingSection = buildSection(billingIssues);

  const allIssues = [...parentIssues, ...childIssues, ...billingIssues];
  const hasBlockingIssues = allIssues.some(i => i.severity === 'blocker');
  const hasBookingWarnings = allIssues.some(i => i.severity === 'warning');
  const hasAdvisories = allIssues.some(i => i.severity === 'advisory');

  // ─── Completion percent ───────────────────────────────────────────────────────

  const completionPercent = computeCompletionPercent(
    parentSection,
    childSection,
    billingSection,
    childrenData,
  );

  return {
    parent: parentSection,
    child: childSection,
    billing: billingSection,
    hasBlockingIssues,
    hasBookingWarnings,
    hasAdvisories,
    completionPercent,
  };
}

/**
 * Light-weight check for booking eligibility for a specific child.
 * Used by booking API to reject requests without computing the full object.
 */
export async function checkBookingEligibility(
  supabaseAdmin: SupabaseClient,
  parentId: string,
  childId: string,
): Promise<{ eligible: boolean; blockers: CompletionIssue[] }> {
  const completion = await getProfileCompletion(supabaseAdmin, parentId);

  // Collect all blockers + warnings that should block booking
  const bookingBlockers = [
    ...completion.parent.blockers,
    ...completion.child.blockers.filter(
      i => !i.childId || i.childId === childId,
    ),
    ...completion.billing.blockers,
    // Warnings also block booking
    ...completion.child.warnings.filter(
      i => !i.childId || i.childId === childId,
    ),
  ];

  return {
    eligible: bookingBlockers.length === 0,
    blockers: bookingBlockers,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function buildSection(issues: CompletionIssue[]): CompletionSection {
  const blockers = issues.filter(i => i.severity === 'blocker');
  const warnings = issues.filter(i => i.severity === 'warning');
  const advisories = issues.filter(i => i.severity === 'advisory');

  return {
    complete: blockers.length === 0 && warnings.length === 0,
    blockers,
    warnings,
    advisories,
  };
}

function computeCompletionPercent(
  parent: CompletionSection,
  child: CompletionSection,
  billing: CompletionSection,
  children: ChildData[],
): number {
  // Weight: parent = 25%, child = 50%, billing = 25%
  const activeChildren = children.filter(c => c.active);

  // Parent: 4 required fields (first_name, last_name, email, phone)
  const parentRequired = 4;
  const parentBlockers = parent.blockers.length;
  const parentScore = parentRequired > 0
    ? Math.max(0, (parentRequired - parentBlockers) / parentRequired)
    : 1;

  // Child: per-child required items (DOB, emergency contact, medical profile, authorized pickup, allergy action plans)
  let childScore = 0;
  if (activeChildren.length === 0) {
    childScore = 0;
  } else {
    let totalRequired = 0;
    let totalMet = 0;
    for (const ch of activeChildren) {
      // 4 base requirements + 1 per allergy needing action plan
      const allergyCount = ch.allergies.length;
      const required = 4 + allergyCount;
      totalRequired += required;

      let met = 0;
      if (ch.date_of_birth) met++;
      if (ch.emergency_contacts_count >= 1) met++;
      if (ch.has_medical_profile) met++;
      if (ch.authorized_pickups_count >= 1) met++;
      for (const a of ch.allergies) {
        if (a.has_action_plan && a.action_plan_treatment !== 'NONE') met++;
      }
      totalMet += met;
    }
    childScore = totalRequired > 0 ? totalMet / totalRequired : 1;
  }

  // Billing: stripe_customer_id present
  const billingScore = billing.blockers.length === 0 ? 1 : 0;

  const weighted = (parentScore * 25 + childScore * 50 + billingScore * 25);
  return Math.round(weighted);
}
