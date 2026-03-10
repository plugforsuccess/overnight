import { NextRequest } from 'next/server';
import { authenticateParentForFacility, checkFacilityAdmin, checkFacilityStaff, checkOrganizationAdmin, checkOrganizationSupport, checkPlatformAdmin, checkPlatformSupport } from '@/lib/facility-auth';

/**
 * Verify request has facility admin or platform admin/support access.
 */
export async function checkAdmin(req: NextRequest) {
  const session = await authenticateParentForFacility(req);
  if (!session) return null;
  if (checkPlatformAdmin(session) || checkPlatformSupport(session) || checkFacilityAdmin(session) || checkOrganizationAdmin(session)) {
    return session;
  }
  return null;
}


export async function checkFacilityStaffOrAdmin(req: NextRequest) {
  const session = await authenticateParentForFacility(req);
  if (!session) return null;
  if (checkPlatformAdmin(session) || checkFacilityStaff(session) || checkOrganizationAdmin(session)) return session;
  return null;
}

export async function checkOrgReadAccess(req: NextRequest) {
  const session = await authenticateParentForFacility(req);
  if (!session) return null;
  if (checkPlatformAdmin(session) || checkPlatformSupport(session) || checkOrganizationSupport(session) || checkFacilityAdmin(session)) return session;
  return null;
}

export async function checkOpsReadAccess(req: NextRequest) {
  const session = await authenticateParentForFacility(req);
  if (!session) return null;
  if (checkPlatformAdmin(session) || checkPlatformSupport(session) || checkFacilityStaff(session) || checkOrganizationSupport(session)) return session;
  return null;
}

export async function checkOpsWriteAccess(req: NextRequest) {
  const session = await authenticateParentForFacility(req);
  if (!session) return null;
  if (checkPlatformAdmin(session) || checkFacilityStaff(session) || checkOrganizationAdmin(session)) return session;
  return null;
}
