import type { CompletionIssue } from './types';

// ─── Parent profile rules ──────────────────────────────────────────────────────

export type ParentData = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  stripe_customer_id: string | null;
};

export function evaluateParentRules(parent: ParentData): CompletionIssue[] {
  const issues: CompletionIssue[] = [];

  if (!parent.first_name?.trim()) {
    issues.push({
      code: 'missing_parent_first_name',
      label: 'Add your first name',
      severity: 'blocker',
      area: 'parent',
      actionPath: '/dashboard/settings',
    });
  }

  if (!parent.last_name?.trim()) {
    issues.push({
      code: 'missing_parent_last_name',
      label: 'Add your last name',
      severity: 'blocker',
      area: 'parent',
      actionPath: '/dashboard/settings',
    });
  }

  if (!parent.phone?.trim()) {
    issues.push({
      code: 'missing_parent_phone',
      label: 'Add your phone number',
      severity: 'blocker',
      area: 'parent',
      actionPath: '/dashboard/settings',
    });
  }

  if (!parent.email?.trim()) {
    issues.push({
      code: 'missing_parent_email',
      label: 'Add your email address',
      severity: 'blocker',
      area: 'parent',
      actionPath: '/dashboard/settings',
    });
  }

  if (!parent.address?.trim()) {
    issues.push({
      code: 'missing_parent_address',
      label: 'Add your home address',
      severity: 'warning',
      area: 'parent',
      actionPath: '/dashboard/settings',
    });
  }

  return issues;
}

// ─── Child profile rules ───────────────────────────────────────────────────────

export type ChildData = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  active: boolean;
  allergies: ChildAllergyData[];
  emergency_contacts_count: number;
  authorized_pickups_count: number;
  has_medical_profile: boolean;
  medical_notes: string | null;
};

export type ChildAllergyData = {
  id: string;
  allergen: string;
  severity: string;
  has_action_plan: boolean;
  action_plan_treatment: string | null;
};

export function evaluateChildRules(children: ChildData[]): CompletionIssue[] {
  const issues: CompletionIssue[] = [];
  const activeChildren = children.filter(c => c.active);

  // Tier 1: No active child profile exists
  if (activeChildren.length === 0) {
    issues.push({
      code: 'no_active_child',
      label: 'Add at least one child profile',
      severity: 'blocker',
      area: 'child',
      actionPath: '/dashboard/children',
    });
    return issues;
  }

  for (const child of activeChildren) {
    const name = `${child.first_name} ${child.last_name}`;

    // Tier 1: Missing DOB
    if (!child.date_of_birth) {
      issues.push({
        code: 'missing_child_dob',
        label: `Add date of birth for ${name}`,
        severity: 'blocker',
        area: 'child',
        actionPath: '/dashboard/children',
        childId: child.id,
        childName: name,
      });
    }

    // Tier 1: No emergency contact
    if (child.emergency_contacts_count < 1) {
      issues.push({
        code: 'missing_emergency_contact',
        label: `Add at least one emergency contact for ${name}`,
        severity: 'blocker',
        area: 'child',
        actionPath: '/dashboard/children',
        childId: child.id,
        childName: name,
      });
    }

    // Tier 1: No medical profile / allergy acknowledgement
    if (!child.has_medical_profile) {
      issues.push({
        code: 'missing_medical_profile',
        label: `Complete medical acknowledgement for ${name}`,
        severity: 'blocker',
        area: 'child',
        actionPath: '/dashboard/children',
        childId: child.id,
        childName: name,
      });
    }

    // Tier 1: Allergy exists without action plan / treatment
    for (const allergy of child.allergies) {
      if (!allergy.has_action_plan || allergy.action_plan_treatment === 'NONE') {
        issues.push({
          code: 'missing_allergy_action_plan',
          label: `Add emergency treatment plan for ${name}'s ${formatAllergen(allergy.allergen)} allergy`,
          severity: 'blocker',
          area: 'child',
          actionPath: '/dashboard/children',
          childId: child.id,
          childName: name,
        });
      }
    }

    // Tier 1: No authorized pickup and no explicit parent-only rule
    // For this platform, having 0 authorized pickups is treated as a blocker
    // unless the parent has explicitly opted for parent-only pickup (not yet modeled,
    // so we treat 0 pickups as a blocker).
    if (child.authorized_pickups_count < 1) {
      issues.push({
        code: 'missing_authorized_pickup',
        label: `Add at least one authorized pickup for ${name}`,
        severity: 'blocker',
        area: 'child',
        actionPath: '/dashboard/children',
        childId: child.id,
        childName: name,
      });
    }

    // Tier 3: Missing caregiver notes (advisory)
    if (!child.medical_notes?.trim()) {
      issues.push({
        code: 'missing_caregiver_notes',
        label: `Add caregiver notes for ${name}`,
        severity: 'advisory',
        area: 'child',
        actionPath: '/dashboard/children',
        childId: child.id,
        childName: name,
      });
    }

    // Tier 3: Second emergency contact missing (advisory)
    if (child.emergency_contacts_count === 1) {
      issues.push({
        code: 'missing_second_emergency_contact',
        label: `Add a second emergency contact for ${name}`,
        severity: 'advisory',
        area: 'child',
        actionPath: '/dashboard/children',
        childId: child.id,
        childName: name,
      });
    }
  }

  return issues;
}

// ─── Billing rules ─────────────────────────────────────────────────────────────

export type BillingData = {
  stripe_customer_id: string | null;
  has_active_payment_method: boolean;
  has_active_subscription: boolean;
};

export function evaluateBillingRules(billing: BillingData): CompletionIssue[] {
  const issues: CompletionIssue[] = [];

  if (!billing.stripe_customer_id) {
    issues.push({
      code: 'missing_billing_setup',
      label: 'Set up billing to book care',
      severity: 'blocker',
      area: 'billing',
      actionPath: '/dashboard/payments',
    });
  } else if (!billing.has_active_payment_method) {
    issues.push({
      code: 'missing_payment_method',
      label: 'Add a payment method',
      severity: 'warning',
      area: 'billing',
      actionPath: '/dashboard/payments',
    });
  }

  return issues;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatAllergen(allergen: string): string {
  const labels: Record<string, string> = {
    PEANUT: 'Peanut',
    TREE_NUT: 'Tree Nut',
    MILK: 'Milk',
    EGG: 'Egg',
    WHEAT: 'Wheat',
    SOY: 'Soy',
    FISH: 'Fish',
    SHELLFISH: 'Shellfish',
    SESAME: 'Sesame',
    PENICILLIN: 'Penicillin',
    INSECT_STING: 'Insect Sting',
    LATEX: 'Latex',
    ASTHMA: 'Asthma',
    ENVIRONMENTAL: 'Environmental',
  };
  return labels[allergen] || allergen;
}
