import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { correctAttendanceStatus } from '@/lib/attendance/correct';
import { z } from 'zod';

const correctSchema = z.object({
  attendanceRecordId: z.string().uuid('attendanceRecordId must be a valid UUID'),
  newStatus: z.enum(['expected', 'checked_in', 'checked_out', 'no_show', 'cancelled']),
  reason: z.string().min(3, 'Reason must be at least 3 characters').max(1000),
});

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
    const parsed = correctSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map(e => e.message).join(', ') }, { status: 400 });
    }

    const record = await correctAttendanceStatus(supabaseAdmin, {
      attendanceRecordId: parsed.data.attendanceRecordId,
      actorUserId: admin.id,
      newStatus: parsed.data.newStatus,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
