import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function getUserClient(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

/**
 * GET /api/capacity?dates=2026-03-08,2026-03-09,...
 *
 * Returns availability for requested dates.
 * Uses program_capacity table (preferred) with fallback to counting reservations.
 */
export async function GET(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const datesParam = searchParams.get('dates');
  if (!datesParam) {
    return NextResponse.json({ error: 'dates parameter is required' }, { status: 400 });
  }

  const dates = datesParam.split(',').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dates.length === 0) {
    return NextResponse.json({ error: 'No valid dates provided' }, { status: 400 });
  }

  // Try program_capacity first
  const { data: programCapData } = await supabaseAdmin
    .from('program_capacity')
    .select('care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .in('care_date', dates);

  // Fetch admin settings for default capacity
  const { data: adminSettings } = await supabaseAdmin
    .from('admin_settings')
    .select('max_capacity')
    .limit(1)
    .single();
  const defaultCapacity = adminSettings?.max_capacity ?? 6;

  // For dates not in program_capacity, count reservations
  const coveredDates = new Set((programCapData ?? []).map((r: { care_date: string }) => r.care_date));
  const uncoveredDates = dates.filter(d => !coveredDates.has(d));

  let reservationCounts: Record<string, number> = {};
  if (uncoveredDates.length > 0) {
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('date')
      .in('date', uncoveredDates)
      .eq('status', 'confirmed');

    reservationCounts = {};
    uncoveredDates.forEach(d => reservationCounts[d] = 0);
    reservations?.forEach((r: { date: string }) => {
      reservationCounts[r.date] = (reservationCounts[r.date] || 0) + 1;
    });
  }

  // Build unified response
  const capacity: Record<string, {
    total: number;
    reserved: number;
    waitlisted: number;
    remaining: number;
    status: string;
  }> = {};

  for (const date of dates) {
    const pcRow = (programCapData ?? []).find((r: { care_date: string }) => r.care_date === date);
    if (pcRow) {
      capacity[date] = {
        total: pcRow.capacity_total,
        reserved: pcRow.capacity_reserved,
        waitlisted: pcRow.capacity_waitlisted,
        remaining: pcRow.capacity_total - pcRow.capacity_reserved,
        status: pcRow.status,
      };
    } else {
      const reserved = reservationCounts[date] ?? 0;
      capacity[date] = {
        total: defaultCapacity,
        reserved,
        waitlisted: 0,
        remaining: defaultCapacity - reserved,
        status: reserved >= defaultCapacity ? 'full' : 'open',
      };
    }
  }

  return NextResponse.json({ capacity });
}
