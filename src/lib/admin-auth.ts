import { NextRequest } from 'next/server';
import { authenticateParentForFacility, checkFacilityAdmin, checkPlatformAdmin, checkPlatformSupport } from '@/lib/facility-auth';

/**
 * Verify request has facility admin or platform admin/support access.
 */
export async function checkAdmin(req: NextRequest) {
  const session = await authenticateParentForFacility(req);
  if (!session) return null;
  if (checkPlatformAdmin(session) || checkPlatformSupport(session) || checkFacilityAdmin(session)) {
    return session;
  }
  return null;
}
