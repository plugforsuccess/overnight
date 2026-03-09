import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { markNoShow } from '@/lib/attendance/mark-no-show';
import { z } from 'zod';

const noShowSchema = z.object({
  reservationNightId: z.string().uuid('reservationNightId must be a valid UUID'),
  reason: z.string().max(1000).optional(),
});

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
    const parsed = noShowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map(e => e.message).join(', ') }, { status: 400 });
    }

    const record = await markNoShow(supabaseAdmin, {
      reservationNightId: parsed.data.reservationNightId,
      actorUserId: admin.id,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
