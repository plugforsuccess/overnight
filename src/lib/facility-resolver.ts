import { supabaseAdmin } from '@/lib/supabase-server';

export const SEEDED_DEFAULT_FACILITY_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Resolves a facility id for parent creation in single-center mode.
 *
 * Priority:
 *  1) Seeded default facility (deterministic when present + active)
 *  2) Oldest active facility by created_at then id
 *
 * Throws with a clear message when no active facility is available.
 */
export async function resolveParentFacilityIdOrThrow(): Promise<string> {
  const { data: seededFacility, error: seededError } = await supabaseAdmin
    .from('facilities')
    .select('id')
    .eq('id', SEEDED_DEFAULT_FACILITY_ID)
    .eq('is_active', true)
    .maybeSingle();

  if (seededError) {
    throw new Error(`[facility-resolution] Failed to query seeded facility: ${seededError.message}`);
  }

  if (seededFacility?.id) return seededFacility.id;

  const { data: fallbackFacility, error: fallbackError } = await supabaseAdmin
    .from('facilities')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    throw new Error(`[facility-resolution] Failed to query active facilities: ${fallbackError.message}`);
  }

  if (!fallbackFacility?.id) {
    throw new Error('Cannot create parent profile: no active facility context could be resolved.');
  }

  return fallbackFacility.id;
}
