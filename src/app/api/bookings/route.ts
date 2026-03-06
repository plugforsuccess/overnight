import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { DEFAULT_PRICING_TIERS } from '@/lib/constants';

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
    .eq('auth_user_id', authUserId)
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parentId = await resolveParentId(user.id);
  if (!parentId) return NextResponse.json({ error: 'Parent profile not found' }, { status: 400 });

  const { data: plans, error: plansError } = await supabase
    .from('plans')
    .select('*, child:children(*)')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false });

  if (plansError) return NextResponse.json({ error: 'Failed to load plans' }, { status: 400 });

  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('*, child:children(*)')
    .eq('parent_id', parentId)
    .order('night_date', { ascending: true });

  if (resError) return NextResponse.json({ error: 'Failed to load reservations' }, { status: 400 });

  const { data: waitlist } = await supabase
    .from('waitlist')
    .select('*, child:children(*)')
    .eq('parent_id', parentId)
    .in('status', ['waiting', 'offered']);

  return NextResponse.json({ plans, reservations, waitlist: waitlist || [] });
}

export async function POST(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parentId = await resolveParentId(user.id);
  if (!parentId) return NextResponse.json({ error: 'Parent profile not found' }, { status: 400 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(', ') }, { status: 400 });
  }

  const { childId, nightsPerWeek, selectedNights, weekStart } = parsed.data;

  // Verify child belongs to this parent
  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', parentId)
    .single();

  if (!child) return NextResponse.json({ error: 'Child not found or does not belong to you' }, { status: 403 });

  // Look up the canonical price from pricing tiers — never trust client-provided prices
  const tier = DEFAULT_PRICING_TIERS.find(t => t.nights === nightsPerWeek);
  if (!tier) return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 });
  const priceCents = tier.price_cents;

  // Validate night count matches plan
  if (selectedNights.length !== nightsPerWeek) {
    return NextResponse.json(
      { error: `You must select exactly ${nightsPerWeek} nights for this plan` },
      { status: 400 }
    );
  }

  // Get admin settings for capacity
  const { data: settings } = await supabaseAdmin
    .from('admin_settings')
    .select('max_capacity')
    .limit(1)
    .single();

  const maxCapacity = settings?.max_capacity ?? 6;

  // Check capacity for each night (server-side)
  const fullNights: string[] = [];
  for (const nightDate of selectedNights) {
    const { count } = await supabaseAdmin
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('night_date', nightDate)
      .eq('status', 'confirmed');

    if ((count ?? 0) >= maxCapacity) {
      fullNights.push(nightDate);
    }
  }

  // Create plan with server-verified price
  const { data: plan, error: planError } = await supabaseAdmin
    .from('plans')
    .insert({
      parent_id: parentId,
      child_id: childId,
      nights_per_week: nightsPerWeek,
      price_cents: priceCents,
      status: 'active',
      week_start: weekStart,
    })
    .select()
    .single();

  if (planError) return NextResponse.json({ error: 'Failed to create plan' }, { status: 400 });

  // Create confirmed reservations for available nights
  const availableNights = selectedNights.filter((n: string) => !fullNights.includes(n));
  if (availableNights.length > 0) {
    const { error: resError } = await supabaseAdmin
      .from('reservations')
      .insert(
        availableNights.map((nightDate: string) => ({
          plan_id: plan.id,
          child_id: childId,
          parent_id: parentId,
          night_date: nightDate,
          status: 'confirmed',
        }))
      );
    if (resError) return NextResponse.json({ error: 'Failed to create reservations' }, { status: 400 });
  }

  // Add to waitlist for full nights
  for (const nightDate of fullNights) {
    const { count: waitlistCount } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .eq('night_date', nightDate)
      .eq('status', 'waiting');

    await supabaseAdmin.from('waitlist').insert({
      parent_id: parentId,
      child_id: childId,
      night_date: nightDate,
      position: (waitlistCount ?? 0) + 1,
      status: 'waiting',
    });
  }

  return NextResponse.json({
    plan,
    confirmedNights: availableNights,
    waitlistedNights: fullNights,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parentId = await resolveParentId(user.id);
  if (!parentId) return NextResponse.json({ error: 'Parent profile not found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('id');
  if (!reservationId) return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });

  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('parent_id', parentId);

  if (error) return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 400 });
  return NextResponse.json({ success: true });
}
