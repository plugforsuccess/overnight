import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

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

  // Use supabaseAdmin to check role from the parents table (trusted source, not user-writable)
  const { data: parent } = await supabaseAdmin
    .from('parents')
    .select('id, role, is_admin')
    .eq('auth_user_id', user.id)
    .single();

  if (!parent || (parent.role !== 'admin' && !parent.is_admin)) return null;
  return user;
}

// Validation for admin settings update
const settingsUpdateSchema = z.object({
  id: z.string(),
  max_capacity: z.number().int().min(1).max(50).optional(),
  operating_nights: z.array(z.string()).optional(),
  pricing_tiers: z.array(z.object({
    nights: z.number().int().min(1).max(7),
    price_cents: z.number().int().min(0),
  })).optional(),
}).passthrough();

// GET: Admin dashboard data
export async function GET(req: NextRequest) {
  const user = await checkAdmin(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view');
  const nightDate = searchParams.get('date');

  if (view === 'roster' && nightDate) {
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('*, child:children(id, first_name, last_name, date_of_birth), parent:parents(id, first_name, last_name, email, phone)')
      .eq('night_date', nightDate)
      .eq('status', 'confirmed');

    return NextResponse.json({ reservations: reservations || [] });
  }

  if (view === 'plans') {
    const { data: plans } = await supabaseAdmin
      .from('plans')
      .select('*, child:children(id, first_name, last_name), parent:parents(id, first_name, last_name, email)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    const totalRevenue = plans?.reduce((sum, p) => sum + p.price_cents, 0) ?? 0;

    return NextResponse.json({ plans: plans || [], totalRevenue });
  }

  if (view === 'waitlist') {
    const { data: waitlist } = await supabaseAdmin
      .from('waitlist')
      .select('*, child:children(id, first_name, last_name), parent:parents(id, first_name, last_name, email)')
      .in('status', ['waiting', 'offered'])
      .order('night_date', { ascending: true })
      .order('position', { ascending: true });

    return NextResponse.json({ waitlist: waitlist || [] });
  }

  if (view === 'settings') {
    const { data: settings } = await supabaseAdmin
      .from('admin_settings')
      .select('id, max_capacity, operating_nights, pricing_tiers, created_at, updated_at')
      .limit(1)
      .single();

    return NextResponse.json({ settings });
  }

  // Default: summary
  const { data: activePlans } = await supabaseAdmin
    .from('plans')
    .select('id, price_cents', { count: 'exact' })
    .eq('status', 'active');

  const { count: totalChildren } = await supabaseAdmin
    .from('children')
    .select('id', { count: 'exact', head: true });

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

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { action } = body;

  if (action === 'update_settings') {
    const { settings } = body;
    const parsed = settingsUpdateSchema.safeParse(settings);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors.map(e => e.message).join(', ') }, { status: 400 });
    }

    // Only allow known fields to be updated
    const { id, max_capacity, operating_nights, pricing_tiers } = parsed.data;
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (max_capacity !== undefined) updatePayload.max_capacity = max_capacity;
    if (operating_nights !== undefined) updatePayload.operating_nights = operating_nights;
    if (pricing_tiers !== undefined) updatePayload.pricing_tiers = pricing_tiers;

    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to update settings' }, { status: 400 });
    return NextResponse.json({ settings: data });
  }

  if (action === 'cancel_reservation') {
    const reservationId = body.reservationId;
    if (!reservationId || typeof reservationId !== 'string') {
      return NextResponse.json({ error: 'reservationId is required' }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from('reservations')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', reservationId);

    if (error) return NextResponse.json({ error: 'Failed to cancel reservation' }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (action === 'add_reservation') {
    const { childId, parentId, planId, nightDate } = body;
    if (!childId || !parentId || !planId || !nightDate) {
      return NextResponse.json({ error: 'childId, parentId, planId, and nightDate are required' }, { status: 400 });
    }
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

    if (error) return NextResponse.json({ error: 'Failed to add reservation' }, { status: 400 });
    return NextResponse.json({ reservation: data });
  }

  if (action === 'promote_waitlist') {
    const waitlistId = body.waitlistId;
    if (!waitlistId || typeof waitlistId !== 'string') {
      return NextResponse.json({ error: 'waitlistId is required' }, { status: 400 });
    }

    const { data: entry } = await supabaseAdmin
      .from('waitlist')
      .select('id, child_id, parent_id, night_date, position, status')
      .eq('id', waitlistId)
      .single();

    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await supabaseAdmin
      .from('waitlist')
      .update({ status: 'confirmed' })
      .eq('id', waitlistId);

    const { data: plan } = await supabaseAdmin
      .from('plans')
      .select('id')
      .eq('child_id', entry.child_id)
      .eq('status', 'active')
      .limit(1)
      .single();

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

    if (resError) return NextResponse.json({ error: 'Failed to create reservation' }, { status: 400 });
    return NextResponse.json({ reservation });
  }

  if (action === 'comp_week') {
    const { parentId, planId, weekStart } = body;
    if (!parentId || !planId || !weekStart) {
      return NextResponse.json({ error: 'parentId, planId, and weekStart are required' }, { status: 400 });
    }
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

    if (error) return NextResponse.json({ error: 'Failed to create payment' }, { status: 400 });
    return NextResponse.json({ payment: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
