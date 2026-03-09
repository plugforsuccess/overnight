/**
 * Unit tests for profile completion rules.
 * These test the pure rule evaluation functions without database access.
 *
 * Run: npx jest tests/unit/profile-completion-rules.test.js
 */

// We need to transpile the TS source. Use tsx to run, or inline the logic.
// Since Jest doesn't have ts-jest configured, we test by calling the compiled output
// or by duplicating the rule logic here for validation.
// Best approach: use tsx register.

// NOTE: If ts-jest or @swc/jest is not available, this test validates
// the rule logic by re-implementing the core checks in JS.
// The canonical implementation lives in src/lib/profile-completion/rules.ts

// ─── Rule logic (mirrored from rules.ts for testability without ts-jest) ────

function evaluateParentRules(parent) {
  const issues = [];

  if (!parent.first_name || !parent.first_name.trim()) {
    issues.push({
      code: 'missing_parent_first_name',
      label: 'Add your first name',
      severity: 'blocker',
      area: 'parent',
    });
  }

  if (!parent.last_name || !parent.last_name.trim()) {
    issues.push({
      code: 'missing_parent_last_name',
      label: 'Add your last name',
      severity: 'blocker',
      area: 'parent',
    });
  }

  if (!parent.phone || !parent.phone.trim()) {
    issues.push({
      code: 'missing_parent_phone',
      label: 'Add your phone number',
      severity: 'blocker',
      area: 'parent',
    });
  }

  if (!parent.email || !parent.email.trim()) {
    issues.push({
      code: 'missing_parent_email',
      label: 'Add your email address',
      severity: 'blocker',
      area: 'parent',
    });
  }

  if (!parent.address || !parent.address.trim()) {
    issues.push({
      code: 'missing_parent_address',
      label: 'Add your home address',
      severity: 'warning',
      area: 'parent',
    });
  }

  return issues;
}

function evaluateChildRules(children) {
  const issues = [];
  const activeChildren = children.filter(c => c.active);

  if (activeChildren.length === 0) {
    issues.push({
      code: 'no_active_child',
      label: 'Add at least one child profile',
      severity: 'blocker',
      area: 'child',
    });
    return issues;
  }

  for (const child of activeChildren) {
    const name = `${child.first_name} ${child.last_name}`;

    if (!child.date_of_birth) {
      issues.push({
        code: 'missing_child_dob',
        label: `Add date of birth for ${name}`,
        severity: 'blocker',
        area: 'child',
        childId: child.id,
        childName: name,
      });
    }

    if (child.emergency_contacts_count < 1) {
      issues.push({
        code: 'missing_emergency_contact',
        label: `Add at least one emergency contact for ${name}`,
        severity: 'blocker',
        area: 'child',
        childId: child.id,
        childName: name,
      });
    }

    if (!child.has_medical_profile) {
      issues.push({
        code: 'missing_medical_profile',
        label: `Complete medical acknowledgement for ${name}`,
        severity: 'blocker',
        area: 'child',
        childId: child.id,
        childName: name,
      });
    }

    for (const allergy of child.allergies) {
      if (!allergy.has_action_plan || allergy.action_plan_treatment === 'NONE') {
        issues.push({
          code: 'missing_allergy_action_plan',
          label: `Add emergency treatment plan for ${name}'s ${allergy.allergen} allergy`,
          severity: 'blocker',
          area: 'child',
          childId: child.id,
          childName: name,
        });
      }
    }

    if (child.authorized_pickups_count < 1) {
      issues.push({
        code: 'missing_authorized_pickup',
        label: `Add at least one authorized pickup for ${name}`,
        severity: 'blocker',
        area: 'child',
        childId: child.id,
        childName: name,
      });
    }

    if (!child.medical_notes || !child.medical_notes.trim()) {
      issues.push({
        code: 'missing_caregiver_notes',
        label: `Add caregiver notes for ${name}`,
        severity: 'advisory',
        area: 'child',
        childId: child.id,
        childName: name,
      });
    }

    if (child.emergency_contacts_count === 1) {
      issues.push({
        code: 'missing_second_emergency_contact',
        label: `Add a second emergency contact for ${name}`,
        severity: 'advisory',
        area: 'child',
        childId: child.id,
        childName: name,
      });
    }
  }

  return issues;
}

function evaluateBillingRules(billing) {
  const issues = [];

  if (!billing.stripe_customer_id) {
    issues.push({
      code: 'missing_billing_setup',
      label: 'Set up billing to book care',
      severity: 'blocker',
      area: 'billing',
    });
  } else if (!billing.has_active_payment_method) {
    issues.push({
      code: 'missing_payment_method',
      label: 'Add a payment method',
      severity: 'warning',
      area: 'billing',
    });
  }

  return issues;
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('evaluateParentRules', () => {
  const completeParent = {
    id: 'parent-1',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    address: '123 Main St',
    stripe_customer_id: 'cus_123',
  };

  it('returns no issues for a complete parent', () => {
    const issues = evaluateParentRules(completeParent);
    expect(issues).toHaveLength(0);
  });

  it('returns blocker for missing first name', () => {
    const issues = evaluateParentRules({ ...completeParent, first_name: null });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_parent_first_name', severity: 'blocker' })
    );
  });

  it('returns blocker for missing last name', () => {
    const issues = evaluateParentRules({ ...completeParent, last_name: '' });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_parent_last_name', severity: 'blocker' })
    );
  });

  it('returns blocker for missing phone', () => {
    const issues = evaluateParentRules({ ...completeParent, phone: null });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_parent_phone', severity: 'blocker' })
    );
  });

  it('returns blocker for missing email', () => {
    const issues = evaluateParentRules({ ...completeParent, email: null });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_parent_email', severity: 'blocker' })
    );
  });

  it('returns warning (not blocker) for missing address', () => {
    const issues = evaluateParentRules({ ...completeParent, address: null });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_parent_address', severity: 'warning' })
    );
  });

  it('treats whitespace-only values as missing', () => {
    const issues = evaluateParentRules({ ...completeParent, first_name: '   ', phone: '  ' });
    const blockers = issues.filter(i => i.severity === 'blocker');
    expect(blockers).toHaveLength(2);
  });
});

describe('evaluateChildRules', () => {
  const completeChild = {
    id: 'child-1',
    first_name: 'Alice',
    last_name: 'Doe',
    date_of_birth: '2020-01-15',
    active: true,
    allergies: [],
    emergency_contacts_count: 1,
    authorized_pickups_count: 1,
    has_medical_profile: true,
    medical_notes: 'Some notes',
  };

  it('returns blocker when no active child exists', () => {
    const issues = evaluateChildRules([]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'no_active_child', severity: 'blocker' })
    );
  });

  it('returns no blockers for a complete child', () => {
    const issues = evaluateChildRules([completeChild]);
    const blockers = issues.filter(i => i.severity === 'blocker');
    expect(blockers).toHaveLength(0);
  });

  it('returns blocker for missing DOB', () => {
    const issues = evaluateChildRules([{ ...completeChild, date_of_birth: null }]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_child_dob', severity: 'blocker' })
    );
  });

  it('returns blocker for missing emergency contact', () => {
    const issues = evaluateChildRules([{ ...completeChild, emergency_contacts_count: 0 }]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_emergency_contact', severity: 'blocker' })
    );
  });

  it('returns blocker for missing medical profile', () => {
    const issues = evaluateChildRules([{ ...completeChild, has_medical_profile: false }]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_medical_profile', severity: 'blocker' })
    );
  });

  it('returns blocker for missing authorized pickup', () => {
    const issues = evaluateChildRules([{ ...completeChild, authorized_pickups_count: 0 }]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_authorized_pickup', severity: 'blocker' })
    );
  });

  it('returns blocker for allergy without action plan', () => {
    const childWithAllergy = {
      ...completeChild,
      allergies: [{
        id: 'allergy-1',
        allergen: 'PEANUT',
        severity: 'SEVERE',
        has_action_plan: false,
        action_plan_treatment: null,
      }],
    };

    const issues = evaluateChildRules([childWithAllergy]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'missing_allergy_action_plan',
        severity: 'blocker',
        childId: 'child-1',
      })
    );
  });

  it('returns blocker for allergy with NONE treatment', () => {
    const childWithAllergy = {
      ...completeChild,
      allergies: [{
        id: 'allergy-1',
        allergen: 'PEANUT',
        severity: 'SEVERE',
        has_action_plan: true,
        action_plan_treatment: 'NONE',
      }],
    };

    const issues = evaluateChildRules([childWithAllergy]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'missing_allergy_action_plan',
        severity: 'blocker',
      })
    );
  });

  it('does NOT return blocker for allergy with valid treatment', () => {
    const childWithAllergy = {
      ...completeChild,
      allergies: [{
        id: 'allergy-1',
        allergen: 'PEANUT',
        severity: 'SEVERE',
        has_action_plan: true,
        action_plan_treatment: 'EPINEPHRINE',
      }],
    };

    const issues = evaluateChildRules([childWithAllergy]);
    const blockers = issues.filter(i => i.severity === 'blocker');
    expect(blockers).toHaveLength(0);
  });

  it('returns advisory for missing caregiver notes', () => {
    const issues = evaluateChildRules([{ ...completeChild, medical_notes: null }]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_caregiver_notes', severity: 'advisory' })
    );
  });

  it('returns advisory for missing second emergency contact', () => {
    const issues = evaluateChildRules([completeChild]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_second_emergency_contact', severity: 'advisory' })
    );
  });

  it('skips inactive children', () => {
    const inactiveChild = { ...completeChild, active: false, has_medical_profile: false };
    const issues = evaluateChildRules([inactiveChild]);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'no_active_child', severity: 'blocker' })
    );
  });

  it('evaluates multiple children independently', () => {
    const child1 = { ...completeChild, id: 'child-1', first_name: 'Alice' };
    const child2 = {
      ...completeChild,
      id: 'child-2',
      first_name: 'Bob',
      emergency_contacts_count: 0,
      has_medical_profile: false,
    };

    const issues = evaluateChildRules([child1, child2]);
    const blockers = issues.filter(i => i.severity === 'blocker');
    expect(blockers).toHaveLength(2);
    expect(blockers.every(b => b.childId === 'child-2')).toBe(true);
  });
});

describe('evaluateBillingRules', () => {
  it('returns no issues when billing is complete', () => {
    const billing = {
      stripe_customer_id: 'cus_123',
      has_active_payment_method: true,
      has_active_subscription: true,
    };
    expect(evaluateBillingRules(billing)).toHaveLength(0);
  });

  it('returns blocker when no stripe customer', () => {
    const billing = {
      stripe_customer_id: null,
      has_active_payment_method: false,
      has_active_subscription: false,
    };
    const issues = evaluateBillingRules(billing);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_billing_setup', severity: 'blocker' })
    );
  });

  it('returns warning when customer exists but no payment method', () => {
    const billing = {
      stripe_customer_id: 'cus_123',
      has_active_payment_method: false,
      has_active_subscription: false,
    };
    const issues = evaluateBillingRules(billing);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'missing_payment_method', severity: 'warning' })
    );
  });
});

describe('Severity routing behavior', () => {
  it('warning-only user can access dashboard (no blockers)', () => {
    const issues = evaluateParentRules({
      id: 'p1', first_name: 'Jane', last_name: 'Doe',
      email: 'j@e.com', phone: '555', address: null, stripe_customer_id: 'cus',
    });
    const blockers = issues.filter(i => i.severity === 'blocker');
    expect(blockers).toHaveLength(0);
    expect(issues.some(i => i.severity === 'warning')).toBe(true);
  });

  it('advisory-only user can still book (no blockers or warnings in child rules)', () => {
    const child = {
      id: 'c1', first_name: 'A', last_name: 'B',
      date_of_birth: '2020-01-01', active: true,
      allergies: [], emergency_contacts_count: 2,
      authorized_pickups_count: 1, has_medical_profile: true,
      medical_notes: null,
    };
    const issues = evaluateChildRules([child]);
    const blockersAndWarnings = issues.filter(i => i.severity !== 'advisory');
    expect(blockersAndWarnings).toHaveLength(0);
    expect(issues.some(i => i.severity === 'advisory')).toBe(true);
  });

  it('peanut allergy missing treatment is a BLOCKER, not a yellow advisory', () => {
    const child = {
      id: 'c1', first_name: 'Alice', last_name: 'Doe',
      date_of_birth: '2020-01-01', active: true,
      allergies: [{
        id: 'a1', allergen: 'PEANUT', severity: 'SEVERE',
        has_action_plan: false, action_plan_treatment: null,
      }],
      emergency_contacts_count: 1, authorized_pickups_count: 1,
      has_medical_profile: true, medical_notes: 'notes',
    };
    const issues = evaluateChildRules([child]);
    const allergyIssue = issues.find(i => i.code === 'missing_allergy_action_plan');
    expect(allergyIssue).toBeDefined();
    expect(allergyIssue.severity).toBe('blocker');
    expect(allergyIssue.severity).not.toBe('advisory');
  });
});
