import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { checkInChild } from '@/lib/attendance/check-in';

/**
 * POST /api/admin/attendance/check-in
 * Check in a child for a reserved night.
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { reservationNightId, arrivalNotes, checkInMethod } = body;

    if (!reservationNightId) {
      return NextResponse.json({ error: 'reservationNightId is required' }, { status: 400 });
    }

    const record = await checkInChild(supabaseAdmin, {
      reservationNightId,
      actorUserId: admin.id,
      arrivalNotes,
      checkInMethod,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
