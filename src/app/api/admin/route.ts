import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

async function checkAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return null;
  return user;
}

// GET: Admin dashboard data
export async function GET(req: NextRequest) {
  const user = await checkAdmin(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view');
  const nightDate = searchParams.get('date');

  if (view === 'roster' && nightDate) {
    // Get reservations for a specific night
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('*, child:children(*), parent:profiles(*)')
      .eq('night_date', nightDate)
      .eq('status', 'confirmed');

    return NextResponse.json({ reservations: reservations || [] });
  }

  if (view === 'plans') {
    const { data: plans } = await supabaseAdmin
      .from('plans')
      .select('*, child:children(*), parent:profiles(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    // Calculate total weekly revenue
    const totalRevenue = plans?.reduce((sum, p) => sum + p.price_cents, 0) ?? 0;

    return NextResponse.json({ plans: plans || [], totalRevenue });
  }

  if (view === 'waitlist') {
    const { data: waitlist } = await supabaseAdmin
      .from('waitlist')
      .select('*, child:children(*), parent:profiles(*)')
      .in('status', ['waiting', 'offered'])
      .order('night_date', { ascending: true })
      .order('position', { ascending: true });

    return NextResponse.json({ waitlist: waitlist || [] });
  }

  if (view === 'settings') {
    const { data: settings } = await supabaseAdmin
      .from('admin_settings')
      .select('*')
      .limit(1)
      .single();

    return NextResponse.json({ settings });
  }

  // Default: summary
  const { data: activePlans } = await supabaseAdmin
    .from('plans')
    .select('*', { count: 'exact' })
    .eq('status', 'active');

  const { count: totalChildren } = await supabaseAdmin
    .from('children')
    .select('*', { count: 'exact', head: true });

  const totalRevenue = activePlans?.reduce((sum, p) => sum + p.price_cents, 0) ?? 0;

  return NextResponse.json({
    activePlansCount: activePlans?.length ?? 0,
    totalChildren: totalChildren ?? 0,
    weeklyRevenue: totalRevenue,
  });
}

// PUT: Update admin settings
export async function PUT(req: NextRequest) {
  const user = await checkAdmin(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === 'update_settings') {
    const { settings } = body;
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ settings: data });
  }

  if (action === 'cancel_reservation') {
    const { reservationId } = body;
    const { error } = await supabaseAdmin
      .from('reservations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', reservationId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === 'add_reservation') {
    const { childId, parentId, planId, nightDate } = body;
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .insert({
        child_id: childId,
        parent_id: parentId,
        plan_id: planId,
        night_date: nightDate,
        status: 'confirmed',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ reservation: data });
  }

  if (action === 'promote_waitlist') {
    const { waitlistId } = body;

    // Get the waitlist entry
    const { data: entry } = await supabaseAdmin
      .from('waitlist')
      .select('*')
      .eq('id', waitlistId)
      .single();

    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Update waitlist status
    await supabaseAdmin
      .from('waitlist')
      .update({ status: 'confirmed' })
      .eq('id', waitlistId);

    // Find an active plan for this child
    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('child_id', entry.child_id)
      .eq('status', 'active')
      .limit(1)
      .single();

    // Create reservation
    const { data: reservation, error: resError } = await supabaseAdmin
      .from('reservations')
      .insert({
        child_id: entry.child_id,
        parent_id: entry.parent_id,
        plan_id: plan?.id || entry.id,
        night_date: entry.night_date,
        status: 'confirmed',
      })
      .select()
      .single();

    if (resError) return NextResponse.json({ error: resError.message }, { status: 400 });
    return NextResponse.json({ reservation });
  }

  if (action === 'comp_week') {
    const { parentId, planId, weekStart } = body;
    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert({
        parent_id: parentId,
        plan_id: planId,
        amount_cents: 0,
        status: 'comped',
        description: 'Complimentary week',
        week_start: weekStart,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ payment: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
