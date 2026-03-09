import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { checkOutChild } from '@/lib/attendance/check-out';
import { z } from 'zod';

const checkOutSchema = z.object({
  reservationNightId: z.string().uuid('reservationNightId must be a valid UUID'),
  pickupId: z.string().uuid().optional(),
  pickupVerificationStatus: z.enum(['not_applicable', 'pending', 'verified', 'failed', 'manual_override']).optional(),
  departureNotes: z.string().max(1000).optional(),
  checkOutMethod: z.enum(['staff_manual', 'parent_acknowledged', 'system', 'override']).optional(),
});

/**
 * POST /api/admin/attendance/check-out
 * Check out a child from a reserved night. Records pickup verification.
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = checkOutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map(e => e.message).join(', ') }, { status: 400 });
    }

    const record = await checkOutChild(supabaseAdmin, {
      reservationNightId: parsed.data.reservationNightId,
      actorUserId: admin.id,
      pickupId: parsed.data.pickupId,
      pickupVerificationStatus: parsed.data.pickupVerificationStatus,
      departureNotes: parsed.data.departureNotes,
      checkOutMethod: parsed.data.checkOutMethod,
    });

    return NextResponse.json({ success: true, record });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
