import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { checkInChild } from '@/lib/attendance/check-in';
import { z } from 'zod';

const checkInSchema = z.object({
  reservationNightId: z.string().uuid('reservationNightId must be a valid UUID'),
  arrivalNotes: z.string().max(1000).optional(),
  checkInMethod: z.enum(['staff_manual', 'parent_acknowledged', 'system', 'override']).optional(),
});

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
    const parsed = checkInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map(e => e.message).join(', ') }, { status: 400 });
    }

    const record = await checkInChild(supabaseAdmin, {
      reservationNightId: parsed.data.reservationNightId,
      actorUserId: admin.id,
      arrivalNotes: parsed.data.arrivalNotes,
      checkInMethod: parsed.data.checkInMethod,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
