import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { checkOutChild } from '@/lib/attendance/check-out';

/**
 * POST /api/admin/attendance/check-out
 * Check out a child from a reserved night. Records pickup verification.
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { reservationNightId, pickupId, pickupVerificationStatus, departureNotes, checkOutMethod } = body;

    if (!reservationNightId) {
      return NextResponse.json({ error: 'reservationNightId is required' }, { status: 400 });
    }

    const record = await checkOutChild(supabaseAdmin, {
      reservationNightId,
      actorUserId: admin.id,
      pickupId,
      pickupVerificationStatus,
      departureNotes,
      checkOutMethod,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
