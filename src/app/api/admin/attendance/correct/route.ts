import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { correctAttendanceStatus } from '@/lib/attendance/correct';

/**
 * POST /api/admin/attendance/correct
 * Privileged correction path for admin/staff attendance mistakes.
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { attendanceRecordId, newStatus, reason } = body;

    if (!attendanceRecordId) {
      return NextResponse.json({ error: 'attendanceRecordId is required' }, { status: 400 });
    }
    if (!newStatus) {
      return NextResponse.json({ error: 'newStatus is required' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: 'reason is required for corrections' }, { status: 400 });
    }

    const record = await correctAttendanceStatus(supabaseAdmin, {
      attendanceRecordId,
      actorUserId: admin.id,
      newStatus,
      reason,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
