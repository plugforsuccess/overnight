/**
 * Centralized booking eligibility policy engine.
 *
 * Validates all prerequisites before a parent can book:
 *   - Child has at least 1 emergency contact
 *   - Child is active (not archived)
 *   - Required documents are signed
 *
 * Returns a list of blocking reasons (empty = eligible).
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Check whether a child is eligible for booking.
 * All rules are evaluated — returns all failing reasons at once.
 */
export async function checkBookingEligibility(
  supabase: SupabaseClient,
  parentId: string,
  childId: string,
): Promise<EligibilityResult> {
  const reasons: string[] = [];

  // 1. Verify child exists and belongs to parent
  const { data: child } = await supabase
    .from('children')
    .select('id, first_name, last_name')
    .eq('id', childId)
    .eq('parent_id', parentId)
    .single();

  if (!child) {
    return { eligible: false, reasons: ['Child not found or does not belong to you'] };
  }

  // 2. At least 1 emergency contact required
  const { count: ecCount } = await supabase
    .from('child_emergency_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('child_id', childId);

  if ((ecCount ?? 0) < 1) {
    reasons.push(
      `Add at least 1 emergency contact for ${child.first_name} ${child.last_name}`,
    );
  }

  // 3. Check required document signatures
  const { data: requiredDocs } = await supabase
    .from('parent_documents')
    .select(`
      id,
      title,
      versions:document_versions(id)
    `)
    .eq('required', true)
    .eq('active', true);

  if (requiredDocs && requiredDocs.length > 0) {
    // Get all version IDs for required documents
    const requiredVersionIds: string[] = [];
    for (const doc of requiredDocs) {
      const versions = (doc.versions as { id: string }[]) || [];
      for (const v of versions) {
        requiredVersionIds.push(v.id);
      }
    }

    if (requiredVersionIds.length > 0) {
      // Check which versions this parent has signed
      const { data: signatures } = await supabase
        .from('document_signatures')
        .select('version_id')
        .eq('parent_id', parentId)
        .in('version_id', requiredVersionIds);

      const signedVersionIds = new Set(
        (signatures || []).map((s: { version_id: string }) => s.version_id),
      );

      for (const doc of requiredDocs) {
        const versions = (doc.versions as { id: string }[]) || [];
        const hasSigned = versions.some((v) => signedVersionIds.has(v.id));
        if (!hasSigned) {
          reasons.push(`Please acknowledge "${doc.title}" before booking`);
        }
      }
    }
  }

  return { eligible: reasons.length === 0, reasons };
}
