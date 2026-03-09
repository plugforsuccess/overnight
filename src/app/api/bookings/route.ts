import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getChildComplianceStatus } from '@/lib/children/compliance';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DEFAULT_PRICING_TIERS, BOOKING_WINDOW_DAYS } from '@/lib/constants';
import { rateLimit } from '@/lib/rate-limit';
import { cancelSubscription } from '@/lib/stripe';
import { checkIdempotencyKey, saveIdempotencyResult } from '@/lib/idempotency';
import { authenticateParentForFacility } from '@/lib/facility-auth';

// ─── Error codes ──────────────────────────────────────────────────────────────
type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROFILE_INCOMPLETE'
  | 'CHILD_NOT_OWNED'
  | 'CHILD_INACTIVE'
  | 'INVALID_PLAN_SELECTION'
  | 'STRIPE_CONFIG_ERROR'
  | 'DB_INSERT_FAILED'
  | 'RLS_BLOCKED'
  | 'CAPACITY_CONFLICT'
  | 'UNKNOWN_ERROR';

function errorResponse(
  code: ErrorCode,
  userMessage: string,
  status: number,
  details?: string,
) {
  console.error(`[bookings] error code=${code} message="${userMessage}" details="${details ?? 'none'}"`);
  return NextResponse.json({ error: userMessage, code, details }, { status });
}

function getUserClient(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function resolveParentId(authUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('parents')
    .select('id')
    .eq('id', authUserId)
    .single();
  return data?.id ?? null;
}

// Validation schema for booking requests
const bookingSchema = z.object({
  childId: z.string().uuid('Invalid child ID'),
  nightsPerWeek: z.number().int().min(1).max(7),
  selectedNights: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')).min(1).max(7),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

export async function GET(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);
  const facilitySession = await authenticateParentForFacility(req);
  if (!facilitySession?.activeFacilityId) return errorResponse('AUTH_REQUIRED', 'Facility membership required', 401);

  // Fetch overnight_blocks (the per-user booking records) instead of plans catalog
  const { data: blocks, error: blocksError } = await supabaseAdmin
    .from('overnight_blocks')
    .select('*, child:children(*)')
    .eq('parent_id', parentId)
    .eq('facility_id', facilitySession.activeFacilityId)
    .order('created_at', { ascending: false });

  if (blocksError) {
    console.error('[bookings GET] blocks error:', blocksError);
    return errorResponse('DB_INSERT_FAILED', 'Failed to load bookings', 400, blocksError.message);
  }

  // Fetch reservations through child IDs belonging to this parent
  const { data: children } = await supabaseAdmin
    .from('children')
    .select('id')
    .eq('parent_id', parentId)
    .eq('facility_id', facilitySession.activeFacilityId);

  const childIds = (children || []).map((c: { id: string }) => c.id);

  let reservations: unknown[] = [];
  if (childIds.length > 0) {
    const { data: resData, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('*, child:children(*)')
      .in('child_id', childIds)
      .order('date', { ascending: true });

    if (resError) {
      console.error('[bookings GET] reservations error:', resError);
      return errorResponse('DB_INSERT_FAILED', 'Failed to load reservations', 400, resError.message);
    }
    reservations = resData || [];
  }

  const { data: waitlist } = await supabaseAdmin
    .from('waitlist')
    .select('*, child:children(*)')
    .eq('parent_id', parentId)
    .eq('facility_id', facilitySession.activeFacilityId)
    .in('status', ['waiting', 'offered']);

  return NextResponse.json({
    plans: blocks,
    reservations,
    waitlist: waitlist || [],
  });
}

export async function POST(req: NextRequest) {
  const rateLimited = rateLimit(req, { windowMs: 60_000, max: 10 });
  if (rateLimited) return rateLimited;

  // Idempotency: return cached response if this key was already processed
  const cached = await checkIdempotencyKey(req);
  if (cached) return cached;

  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  console.log(`[bookings POST] authenticated user: ${user.id}`);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);
  const facilitySession = await authenticateParentForFacility(req);
  if (!facilitySession?.activeFacilityId) return errorResponse('AUTH_REQUIRED', 'Facility membership required', 401);
  console.log(`[bookings POST] parent row found: true, parentId=${parentId}`);

  let body;
  try { body = await req.json(); } catch { return errorResponse('INVALID_PLAN_SELECTION', 'Invalid request body', 400); }

  console.log(`[bookings POST] request payload:`, JSON.stringify(body));

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      'INVALID_PLAN_SELECTION',
      parsed.error.issues.map((e: { message: string }) => e.message).join(', '),
      400,
    );
  }

  const { childId, nightsPerWeek, selectedNights, weekStart } = parsed.data;

  // Verify child belongs to this parent and is active
  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id, first_name, last_name, active')
    .eq('id', childId)
    .eq('parent_id', parentId)
    .eq('facility_id', facilitySession.activeFacilityId)
    .single();

  if (!child) {
    console.error(`[bookings POST] child ownership failed: childId=${childId} parentId=${parentId}`);
    return errorResponse('CHILD_NOT_OWNED', 'Child not found or does not belong to you', 403);
  }

  if (!child.active) {
    return errorResponse(
      'CHILD_INACTIVE',
      `${child.first_name} ${child.last_name}'s profile is currently inactive. Please reactivate to book.`,
      400,
    );
  }
  console.log(`[bookings POST] child ownership valid: childId=${childId} name=${child.first_name} ${child.last_name}`);

  const compliance = await getChildComplianceStatus(childId, facilitySession.activeFacilityId);
  console.log(`[bookings POST] profile check: eligible=${compliance.eligibleToBook} blockers=${compliance.blockers.join('; ')}`);
  if (!compliance.eligibleToBook) {
    return errorResponse(
      'PROFILE_INCOMPLETE',
      `Complete ${child.first_name} ${child.last_name}'s profile before booking: ${compliance.blockers.join('; ')}.`,
      400,
    );
  }

  // Look up the plan tier from the plans catalog table
  const { data: planTier, error: planLookupError } = await supabaseAdmin
    .from('plans')
    .select('id, name, nights_per_week, weekly_price_cents')
    .eq('nights_per_week', nightsPerWeek)
    .eq('active', true)
    .single();

  if (!planTier || planLookupError) {
    console.error(`[bookings POST] plan tier lookup failed: nightsPerWeek=${nightsPerWeek}`, planLookupError);
    // Fall back to DEFAULT_PRICING_TIERS if catalog doesn't have a match
    const fallbackTier = DEFAULT_PRICING_TIERS.find(t => t.nights === nightsPerWeek);
    if (!fallbackTier) {
      return errorResponse('INVALID_PLAN_SELECTION', `No plan available for ${nightsPerWeek} nights/week`, 400);
    }
  }

  const priceCents = planTier?.weekly_price_cents
    ?? DEFAULT_PRICING_TIERS.find(t => t.nights === nightsPerWeek)!.price_cents;
  const planId = planTier?.id;
  const planName = planTier?.name ?? `${nightsPerWeek} nights`;

  console.log(`[bookings POST] plan tier: planId=${planId} planName=${planName} priceCents=${priceCents}`);

  // Validate booking window (28 days ahead)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxBookingDate = new Date(today);
  maxBookingDate.setDate(maxBookingDate.getDate() + BOOKING_WINDOW_DAYS);

  for (const nightDate of selectedNights) {
    const d = new Date(nightDate + 'T00:00:00');
    if (d < today) {
      return errorResponse('INVALID_PLAN_SELECTION', `Cannot book a night in the past: ${nightDate}`, 400);
    }
    if (d > maxBookingDate) {
      return errorResponse('INVALID_PLAN_SELECTION', `Cannot book more than ${BOOKING_WINDOW_DAYS} days ahead: ${nightDate}`, 400);
    }
  }

  // Validate night count matches plan
  if (selectedNights.length !== nightsPerWeek) {
    return errorResponse(
      'INVALID_PLAN_SELECTION',
      `You must select exactly ${nightsPerWeek} nights for this plan`,
      400,
    );
  }

  // ── Capacity check via program_capacity (sole source of truth) ──────────────
  // If rows don't exist for requested dates, lazily create them from admin settings defaults.
  // The actual atomic lock+book happens via atomic_book_nights().

  // Fetch admin settings for default capacity
  const { data: adminSettings } = await supabaseAdmin
    .from('admin_settings')
    .select('max_capacity')
    .limit(1)
    .single();
  const maxCapacity = adminSettings?.max_capacity ?? 6;

  // Fetch existing program_capacity rows
  const { data: existingCapRows } = await supabaseAdmin
    .from('program_capacity')
    .select('id, care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .in('care_date', selectedNights);

  const existingDates = new Set((existingCapRows ?? []).map((r: { care_date: string }) => r.care_date));
  const missingDates = selectedNights.filter((d: string) => !existingDates.has(d));

  // Lazy-create missing program_capacity rows from defaults.
  // Uses center_id and program_id from the first existing row, or creates without them.
  if (missingDates.length > 0) {
    // Try to find an active program to link to
    const { data: defaultProgram } = await supabaseAdmin
      .from('programs')
      .select('id, center_id')
      .eq('care_type', 'overnight')
      .eq('is_active', true)
      .limit(1)
      .single();

    const seedRows = missingDates.map((dateStr: string) => ({
      care_date: dateStr,
      capacity_total: maxCapacity,
      capacity_reserved: 0,
      capacity_waitlisted: 0,
      status: 'open',
      ...(defaultProgram ? { center_id: defaultProgram.center_id, program_id: defaultProgram.id } : {}),
    }));

    const { error: seedError } = await supabaseAdmin
      .from('program_capacity')
      .upsert(seedRows, { onConflict: 'program_id,care_date', ignoreDuplicates: true });

    if (seedError) {
      console.warn(`[bookings POST] capacity seed failed for ${missingDates.length} dates:`, seedError);
    } else {
      console.log(`[bookings POST] seeded ${missingDates.length} program_capacity rows`);
    }
  }

  // Re-fetch all capacity rows (including newly seeded ones)
  const { data: programCapData } = await supabaseAdmin
    .from('program_capacity')
    .select('id, care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .in('care_date', selectedNights);

  const fullNights: string[] = [];

  for (const nightDate of selectedNights) {
    const pcRow = (programCapData ?? []).find((c: { care_date: string }) => c.care_date === nightDate);
    if (pcRow) {
      const remaining = pcRow.capacity_total - pcRow.capacity_reserved;
      if (remaining <= 0 || pcRow.status === 'full' || pcRow.status === 'closed') {
        fullNights.push(nightDate);
      }
    } else {
      // No row even after seeding — treat as unavailable (fail safe)
      console.error(`[bookings POST] no program_capacity row for ${nightDate} after seeding attempt`);
      fullNights.push(nightDate);
    }
  }

  console.log(`[bookings POST] capacity pre-check: fullNights=${JSON.stringify(fullNights)}`);

  // Create an overnight_block (the per-user booking record)
  const blockInsert: Record<string, unknown> = {
    parent_id: parentId,
    child_id: childId,
    nights_per_week: nightsPerWeek,
    weekly_price_cents: priceCents,
    status: 'active',
    payment_status: 'pending',
    week_start: weekStart,
    multi_child_discount_pct: 0,
  };
  if (planId) {
    blockInsert.plan_id = planId;
  }

  console.log(`[bookings POST] inserting overnight_block:`, JSON.stringify(blockInsert));

  const { data: block, error: blockError } = await supabaseAdmin
    .from('overnight_blocks')
    .insert(blockInsert)
    .select()
    .single();

  if (blockError) {
    console.error(`[bookings POST] overnight_block insert failed:`, blockError);
    if (blockError.message?.includes('permission denied') || blockError.code === '42501') {
      return errorResponse('RLS_BLOCKED', 'Permission denied creating booking', 403, blockError.message);
    }
    return errorResponse('DB_INSERT_FAILED', 'Failed to create booking', 400, blockError.message);
  }

  console.log(`[bookings POST] overnight_block created: id=${block.id}`);

  // Create reservations for available nights
  const availableNights = selectedNights.filter((n: string) => !fullNights.includes(n));
  if (availableNights.length > 0) {
    const reservationRows = availableNights.map((nightDate: string) => ({
      overnight_block_id: block.id,
      child_id: childId,
      date: nightDate,
      status: 'pending_payment',
    }));

    console.log(`[bookings POST] inserting ${reservationRows.length} reservations`);

    const { error: resError } = await supabaseAdmin
      .from('reservations')
      .insert(reservationRows);

    if (resError) {
      console.error(`[bookings POST] reservations insert failed:`, resError);
      return errorResponse('DB_INSERT_FAILED', 'Failed to create reservations', 400, resError.message);
    }

    // Emit reservation_events for each created reservation
    const { data: createdRes } = await supabaseAdmin
      .from('reservations')
      .select('id')
      .eq('facility_id', facilitySession.activeFacilityId)
      .eq('overnight_block_id', block.id)
      .in('date', availableNights);

    if (createdRes && createdRes.length > 0) {
      // Emit reservation_events
      const eventRows = createdRes.map((r: { id: string }) => ({
        reservation_id: r.id,
        event_type: 'reservation_created',
        event_data: { block_id: block.id, child_id: childId },
        created_by: user.id,
        facility_id: facilitySession.activeFacilityId,
      }));
      await supabaseAdmin.from('reservation_events').insert(eventRows);

      // Atomically create reservation_nights with row-level locking on program_capacity.
      // This prevents overbooking under concurrent writes.
      for (const res of createdRes) {
        const resId = (res as { id: string }).id;
        const { data: atomicResult, error: atomicError } = await supabaseAdmin.rpc('atomic_book_nights', {
          p_reservation_id: resId,
          p_child_id: childId,
          p_night_dates: availableNights,
          p_default_capacity: maxCapacity,
        });

        if (atomicError) {
          console.warn(`[bookings POST] atomic_book_nights failed (non-blocking):`, atomicError);
          // Fallback: create reservation_nights without atomicity
          const nightRows = availableNights.map((nightDate: string) => ({
            reservation_id: resId,
            child_id: childId,
            care_date: nightDate,
            status: 'pending',
            capacity_snapshot: maxCapacity,
            facility_id: facilitySession.activeFacilityId,
          }));
          await supabaseAdmin.from('reservation_nights').insert(nightRows);
        } else {
          console.log(`[bookings POST] atomic_book_nights result:`, JSON.stringify(atomicResult));
        }

        // Only call once per block (not once per reservation)
        break;
      }
    }
  }

  // Add to waitlist for full nights
  for (const nightDate of fullNights) {
    const { count: waitlistCount } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .eq('date', nightDate)
      .eq('status', 'waiting');

    await supabaseAdmin.from('waitlist').insert({
      parent_id: parentId,
      child_id: childId,
      date: nightDate,
      status: 'waiting',
    });

    console.log(`[bookings POST] waitlisted: date=${nightDate} position=${(waitlistCount ?? 0) + 1}`);
  }

  console.log(`[bookings POST] booking complete: blockId=${block.id} confirmed=${availableNights.length} waitlisted=${fullNights.length}`);

  const responseBody = {
    plan: block,
    confirmedNights: availableNights,
    waitlistedNights: fullNights,
  };

  // Cache response for idempotency replay
  await saveIdempotencyResult(req, user.id, 200, responseBody);

  return NextResponse.json(responseBody);
}

export async function DELETE(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);
  const facilitySession = await authenticateParentForFacility(req);
  if (!facilitySession?.activeFacilityId) return errorResponse('AUTH_REQUIRED', 'Facility membership required', 401);

  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('id');
  if (!reservationId) return errorResponse('INVALID_PLAN_SELECTION', 'Reservation ID is required', 400);

  // Verify the reservation belongs to a child of this parent via overnight_block
  const { data: reservation } = await supabaseAdmin
    .from('reservations')
    .select('id, overnight_block_id')
    .eq('id', reservationId)
    .single();

  if (!reservation) return errorResponse('INVALID_PLAN_SELECTION', 'Reservation not found', 404);

  const { data: ownerBlock } = await supabaseAdmin
    .from('overnight_blocks')
    .select('id')
    .eq('id', reservation.overnight_block_id)
    .eq('parent_id', parentId)
    .eq('facility_id', facilitySession.activeFacilityId)
    .single();

  if (!ownerBlock) return errorResponse('CHILD_NOT_OWNED', 'Reservation does not belong to you', 403);

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId);

  if (error) return errorResponse('DB_INSERT_FAILED', 'Failed to cancel reservation', 400, error.message);

  // Cancel linked reservation_nights atomically (decrements capacity counters)
  const { data: linkedNights } = await supabaseAdmin
    .from('reservation_nights')
    .select('id')
    .eq('reservation_id', reservationId)
    .neq('status', 'cancelled');

  if (linkedNights && linkedNights.length > 0) {
    for (const night of linkedNights) {
      const { error: cancelError } = await supabaseAdmin.rpc('atomic_cancel_night', {
        p_reservation_night_id: (night as { id: string }).id,
      });
      if (cancelError) {
        console.warn(`[bookings DELETE] atomic_cancel_night failed for ${(night as { id: string }).id}:`, cancelError);
        // Fallback: direct update without counter decrement
        await supabaseAdmin
          .from('reservation_nights')
          .update({ status: 'cancelled' })
          .eq('id', (night as { id: string }).id);
      }
    }
    console.log(`[bookings DELETE] cancelled ${linkedNights.length} reservation_nights for reservation=${reservationId}`);
  }

  // Emit reservation_cancelled event
  await supabaseAdmin.from('reservation_events').insert({
    reservation_id: reservationId,
    event_type: 'reservation_cancelled',
    event_data: { cancelled_by: user.id, nights_cancelled: linkedNights?.length ?? 0 },
    created_by: user.id,
  });

  // Auto-promote waitlisted entries for freed dates.
  // Each cancelled confirmed/pending night may open a slot.
  if (linkedNights && linkedNights.length > 0) {
    const { data: cancelledNightDetails } = await supabaseAdmin
      .from('reservation_nights')
      .select('care_date')
      .eq('reservation_id', reservationId)
      .eq('status', 'cancelled');

    const freedDates = Array.from(new Set((cancelledNightDetails ?? []).map((n: { care_date: string }) => n.care_date)));
    for (const careDate of freedDates) {
      const { data: promotedId, error: promoteError } = await supabaseAdmin.rpc('promote_waitlist', {
        p_care_date: careDate,
      });
      if (promoteError) {
        console.warn(`[bookings DELETE] auto-promote failed for ${careDate}:`, promoteError);
      } else if (promotedId) {
        console.log(`[bookings DELETE] auto-promoted waitlist night=${promotedId} for date=${careDate}`);
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);
  const facilitySession = await authenticateParentForFacility(req);
  if (!facilitySession?.activeFacilityId) return errorResponse('AUTH_REQUIRED', 'Facility membership required', 401);

  let body;
  try { body = await req.json(); } catch { return errorResponse('INVALID_PLAN_SELECTION', 'Invalid request body', 400); }

  const { planId, action } = body;
  if (!planId || typeof planId !== 'string') {
    return errorResponse('INVALID_PLAN_SELECTION', 'planId is required', 400);
  }

  if (action !== 'cancel') {
    return errorResponse('INVALID_PLAN_SELECTION', 'Invalid action', 400);
  }

  // Verify overnight_block belongs to this parent
  const { data: block } = await supabaseAdmin
    .from('overnight_blocks')
    .select('id, parent_id, stripe_subscription_id, status')
    .eq('id', planId)
    .eq('parent_id', parentId)
    .eq('facility_id', facilitySession.activeFacilityId)
    .single();

  if (!block) return errorResponse('INVALID_PLAN_SELECTION', 'Booking not found', 404);
  if (block.status === 'cancelled') return errorResponse('INVALID_PLAN_SELECTION', 'Booking is already cancelled', 400);

  // Cancel Stripe subscription if exists
  if (block.stripe_subscription_id) {
    try {
      await cancelSubscription(block.stripe_subscription_id);
    } catch {
      // Log but don't block — subscription may have been cancelled on Stripe already
      console.warn(`[bookings PATCH] Stripe cancel failed for subscription: ${block.stripe_subscription_id}`);
    }
  }

  // Cancel the overnight_block
  const { error } = await supabaseAdmin
    .from('overnight_blocks')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', planId);

  if (error) return errorResponse('DB_INSERT_FAILED', 'Failed to cancel booking', 400, error.message);
  return NextResponse.json({ success: true });
}
