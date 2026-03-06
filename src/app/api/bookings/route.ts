import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DEFAULT_PRICING_TIERS } from '@/lib/constants';
import { rateLimit } from '@/lib/rate-limit';
import { cancelSubscription } from '@/lib/stripe';

// ─── Error codes ──────────────────────────────────────────────────────────────
type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROFILE_INCOMPLETE'
  | 'CHILD_NOT_OWNED'
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

  // Fetch overnight_blocks (the per-user booking records) instead of plans catalog
  const { data: blocks, error: blocksError } = await supabaseAdmin
    .from('overnight_blocks')
    .select('*, child:children(*)')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false });

  if (blocksError) {
    console.error('[bookings GET] blocks error:', blocksError);
    return errorResponse('DB_INSERT_FAILED', 'Failed to load bookings', 400, blocksError.message);
  }

  // Fetch reservations through child IDs belonging to this parent
  const { data: children } = await supabaseAdmin
    .from('children')
    .select('id')
    .eq('parent_id', parentId);

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

  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  console.log(`[bookings POST] authenticated user: ${user.id}`);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);
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

  // Verify child belongs to this parent
  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id, first_name, last_name')
    .eq('id', childId)
    .eq('parent_id', parentId)
    .single();

  if (!child) {
    console.error(`[bookings POST] child ownership failed: childId=${childId} parentId=${parentId}`);
    return errorResponse('CHILD_NOT_OWNED', 'Child not found or does not belong to you', 403);
  }
  console.log(`[bookings POST] child ownership valid: childId=${childId} name=${child.first_name} ${child.last_name}`);

  // Check profile completeness: at least 1 emergency contact required.
  // Authorized pickups are optional — the parent is implicitly authorized.
  const { count: ecCount } = await supabaseAdmin
    .from('child_emergency_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('child_id', childId);

  console.log(`[bookings POST] profile check: emergencyContacts=${ecCount ?? 0}`);

  if ((ecCount ?? 0) < 1) {
    return errorResponse(
      'PROFILE_INCOMPLETE',
      `Complete ${child.first_name} ${child.last_name}'s profile before booking: add at least 1 emergency contact.`,
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

  // Validate night count matches plan
  if (selectedNights.length !== nightsPerWeek) {
    return errorResponse(
      'INVALID_PLAN_SELECTION',
      `You must select exactly ${nightsPerWeek} nights for this plan`,
      400,
    );
  }

  // Check capacity for each night (server-side)
  const maxCapacity = 6; // default
  const { data: capacityData } = await supabaseAdmin
    .from('nightly_capacity')
    .select('date, capacity')
    .in('date', selectedNights);

  const fullNights: string[] = [];
  for (const nightDate of selectedNights) {
    // Use nightly_capacity table if available, otherwise count reservations
    const capRow = capacityData?.find((c: { date: string; capacity: number }) => c.date === nightDate);
    const nightCapacity = capRow?.capacity ?? maxCapacity;

    const { count } = await supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('date', nightDate)
      .eq('status', 'confirmed');

    if ((count ?? 0) >= nightCapacity) {
      fullNights.push(nightDate);
    }
  }

  console.log(`[bookings POST] capacity check: fullNights=${JSON.stringify(fullNights)}`);

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

  return NextResponse.json({
    plan: block,
    confirmedNights: availableNights,
    waitlistedNights: fullNights,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);

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
    .single();

  if (!ownerBlock) return errorResponse('CHILD_NOT_OWNED', 'Reservation does not belong to you', 403);

  const { error } = await supabaseAdmin
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId);

  if (error) return errorResponse('DB_INSERT_FAILED', 'Failed to cancel reservation', 400, error.message);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorResponse('AUTH_REQUIRED', 'Unauthorized', 401);

  const parentId = await resolveParentId(user.id);
  if (!parentId) return errorResponse('AUTH_REQUIRED', 'Parent profile not found', 400);

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
