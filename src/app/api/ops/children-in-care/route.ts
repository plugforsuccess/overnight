import { NextRequest, NextResponse } from 'next/server';
import { checkOpsReadAccess } from '@/lib/admin-auth';
import { getChildrenInCare } from '@/lib/staff-operations';

export async function GET(req: NextRequest) {
  const admin = await checkOpsReadAccess(req);
  if (!admin?.activeFacilityId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const childrenInCare = await getChildrenInCare(admin.activeFacilityId);
    return NextResponse.json({ childrenInCare });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load children in care' }, { status: 500 });
  }
}
