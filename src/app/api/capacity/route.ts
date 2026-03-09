import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { authenticateParentForFacility } from '@/lib/facility-auth';

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
 * Uses program_capacity as the sole source of truth.
 * Missing rows are lazily created from admin_settings defaults.
 */
export async function GET(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const facilitySession = await authenticateParentForFacility(req);
  if (!facilitySession?.activeFacilityId) {
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

  // Fetch admin settings for default capacity
  const { data: adminSettings } = await supabaseAdmin
    .from('admin_settings')
    .select('max_capacity')
    .eq('facility_id', facilitySession.activeFacilityId)
    .limit(1)
    .single();
  const defaultCapacity = adminSettings?.max_capacity ?? 6;

  // Fetch existing program_capacity rows
  const { data: existingRows } = await supabaseAdmin
    .from('program_capacity')
    .select('care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .eq('facility_id', facilitySession.activeFacilityId)
    .in('care_date', dates);

  const existingDates = new Set((existingRows ?? []).map((r: { care_date: string }) => r.care_date));
  const missingDates = dates.filter(d => !existingDates.has(d));

  // Lazy-create missing rows from defaults
  if (missingDates.length > 0) {
    const { data: defaultProgram } = await supabaseAdmin
      .from('programs')
      .select('id, center_id')
      .eq('facility_id', facilitySession.activeFacilityId)
      .eq('care_type', 'overnight')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (defaultProgram) {
      const seedRows = missingDates.map(dateStr => ({
        care_date: dateStr,
        capacity_total: defaultCapacity,
        capacity_reserved: 0,
        capacity_waitlisted: 0,
        status: 'open',
        facility_id: facilitySession.activeFacilityId,
        center_id: defaultProgram.center_id,
        program_id: defaultProgram.id,
      }));

      await supabaseAdmin
        .from('program_capacity')
        .upsert(seedRows, { onConflict: 'program_id,care_date', ignoreDuplicates: true });
    }
  }

  // Re-fetch all rows (including newly seeded ones)
  const { data: allRows } = await supabaseAdmin
    .from('program_capacity')
    .select('care_date, capacity_total, capacity_reserved, capacity_waitlisted, status')
    .eq('facility_id', facilitySession.activeFacilityId)
    .in('care_date', dates);

  // Build response
  const capacity: Record<string, {
    total: number;
    reserved: number;
    waitlisted: number;
    remaining: number;
    status: string;
  }> = {};

  for (const date of dates) {
    const pcRow = (allRows ?? []).find((r: { care_date: string }) => r.care_date === date);
    if (pcRow) {
      capacity[date] = {
        total: pcRow.capacity_total,
        reserved: pcRow.capacity_reserved,
        waitlisted: pcRow.capacity_waitlisted,
        remaining: pcRow.capacity_total - pcRow.capacity_reserved,
        status: pcRow.status,
      };
    } else {
      // Shouldn't happen after lazy-create, but fail safe
      capacity[date] = {
        total: defaultCapacity,
        reserved: 0,
        waitlisted: 0,
        remaining: defaultCapacity,
        status: 'open',
      };
    }
  }

  return NextResponse.json({ capacity });
}
