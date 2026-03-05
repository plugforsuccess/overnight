import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { priceCentsForNights } from '@/lib/stripe';

function getUserClient(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: plans, error: plansError } = await supabase
    .from('plans')
    .select('*, child:children(*)')
    .eq('parent_id', user.id)
    .order('created_at', { ascending: false });

  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 400 });

  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('*, child:children(*)')
    .eq('parent_id', user.id)
    .order('night_date', { ascending: true });

  if (resError) return NextResponse.json({ error: resError.message }, { status: 400 });

  const { data: waitlist } = await supabase
    .from('waitlist')
    .select('*, child:children(*)')
    .eq('parent_id', user.id)
    .in('status', ['waiting', 'offered']);

  return NextResponse.json({ plans, reservations, waitlist: waitlist || [] });
}

export async function POST(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { childId, nightsPerWeek, selectedNights, weekStart } = await req.json();

  // Subscription guard: no active plan = cannot reserve nights.
  const { data: activePlan } = await supabaseAdmin
    .from('plans')
    .select('id, status')
    .eq('parent_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!activePlan) {
    return NextResponse.json(
      { error: 'Active subscription required to reserve nights.', code: 'NO_ACTIVE_SUBSCRIPTION' },
      { status: 403 }
    );
  }

  // Look up price server-side — never trust client-supplied price.
  const priceCents = priceCentsForNights(nightsPerWeek);

  // Get admin settings for capacity
  const { data: settings } = await supabaseAdmin
    .from('admin_settings')
    .select('max_capacity')
    .limit(1)
    .single();

  const maxCapacity = settings?.max_capacity ?? 6;

  // Validate night count matches plan
  if (selectedNights.length !== nightsPerWeek) {
    return NextResponse.json(
      { error: `You must select exactly ${nightsPerWeek} nights for this plan` },
      { status: 400 }
    );
  }

  // Check capacity for each night
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

  // Create plan
  const { data: plan, error: planError } = await supabaseAdmin
    .from('plans')
    .insert({
      parent_id: user.id,
      child_id: childId,
      nights_per_week: nightsPerWeek,
      price_cents: priceCents,
      status: 'active',
      week_start: weekStart,
    })
    .select()
    .single();

  if (planError) return NextResponse.json({ error: planError.message }, { status: 400 });

  // Create confirmed reservations for available nights
  const availableNights = selectedNights.filter((n: string) => !fullNights.includes(n));
  if (availableNights.length > 0) {
    const { error: resError } = await supabaseAdmin
      .from('reservations')
      .insert(
        availableNights.map((nightDate: string) => ({
          plan_id: plan.id,
          child_id: childId,
          parent_id: user.id,
          night_date: nightDate,
          status: 'confirmed',
        }))
      );
    if (resError) return NextResponse.json({ error: resError.message }, { status: 400 });
  }

  // Add to waitlist for full nights
  for (const nightDate of fullNights) {
    const { count: waitlistCount } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .eq('night_date', nightDate)
      .eq('status', 'waiting');

    await supabaseAdmin.from('waitlist').insert({
      parent_id: user.id,
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

  const { searchParams } = new URL(req.url);
  const reservationId = searchParams.get('id');

  const { error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('parent_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
