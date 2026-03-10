import { NextRequest, NextResponse } from 'next/server';
import { checkOpsReadAccess } from '@/lib/admin-auth';
import { getOperationsDashboard } from '@/lib/staff-operations';

export async function GET(req: NextRequest) {
  const admin = await checkOpsReadAccess(req);
  if (!admin?.activeFacilityId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  try {
    const payload = await getOperationsDashboard(admin.activeFacilityId, date);
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load dashboard' }, { status: 500 });
  }
}
