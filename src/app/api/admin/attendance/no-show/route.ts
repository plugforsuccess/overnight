import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { markNoShow } from '@/lib/attendance/mark-no-show';

/**
 * POST /api/admin/attendance/no-show
 * Mark a child as no-show for a reserved night.
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { reservationNightId, reason } = body;

    if (!reservationNightId) {
      return NextResponse.json({ error: 'reservationNightId is required' }, { status: 400 });
    }

    const record = await markNoShow(supabaseAdmin, {
      reservationNightId,
      actorUserId: admin.id,
      reason,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
