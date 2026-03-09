import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Fetch all data in parallel
    const [
      reservationNightsResult,
      attendanceResult,
      capacityResult,
      childrenResult,
      emergencyContactsResult,
      authorizedPickupsResult,
      billingResult,
    ] = await Promise.all([
      // Metric 1 & 3: Reservation nights for today
      supabaseAdmin
        .from('reservation_nights')
        .select('id, status')
        .eq('care_date', today),

      // Metric 1: Attendance records for today
      supabaseAdmin
        .from('attendance_records')
        .select('id')
        .eq('care_date', today),

      // Metric 2 & 3: Program capacity for today
      supabaseAdmin
        .from('program_capacity')
        .select('capacity_total, capacity_reserved, capacity_waitlisted')
        .eq('care_date', today),

      // Metric 4: Active children
      supabaseAdmin
        .from('children')
        .select('id')
        .eq('active', true),

      // Metric 4: Emergency contacts (non-archived)
      supabaseAdmin
        .from('child_emergency_contacts')
        .select('child_id')
        .is('archived_at', null),

      // Metric 4: Authorized pickups (active)
      supabaseAdmin
        .from('child_authorized_pickups')
        .select('child_id')
        .eq('is_active', true),

      // Metric 5: Billing ledger for current week
      supabaseAdmin
        .from('billing_ledger')
        .select('amount_cents, status')
        .eq('care_date', today),
    ]);

    // --- Metric 1: Attendance Integrity ---
    const expectedReservations = (reservationNightsResult.data || [])
      .filter((r: any) => r.status === 'confirmed' || r.status === 'completed').length;
    const attendanceCount = (attendanceResult.data || []).length;
    const attendance_integrity = expectedReservations > 0
      ? attendanceCount / expectedReservations
      : 1.0;

    // --- Metric 2: Capacity Utilization ---
    const capacityRows = capacityResult.data || [];
    const totalCapacity = capacityRows.reduce((sum: number, r: any) => sum + (r.capacity_total || 0), 0);
    const totalReserved = capacityRows.reduce((sum: number, r: any) => sum + (r.capacity_reserved || 0), 0);
    const capacity_utilization = totalCapacity > 0
      ? totalReserved / totalCapacity
      : 0;

    // --- Metric 3: Waitlist Pressure ---
    const totalWaitlisted = capacityRows.reduce((sum: number, r: any) => sum + (r.capacity_waitlisted || 0), 0);
    const waitlist_pressure = totalCapacity > 0
      ? totalWaitlisted / totalCapacity
      : 0;

    // --- Metric 4: Safety Completeness ---
    const children = childrenResult.data || [];
    const totalChildren = children.length;

    const emergencyContactChildIds = new Set(
      (emergencyContactsResult.data || []).map((c: any) => c.child_id)
    );
    const pickupChildIds = new Set(
      (authorizedPickupsResult.data || []).map((p: any) => p.child_id)
    );

    const completeProfiles = children.filter((child: any) =>
      emergencyContactChildIds.has(child.id) && pickupChildIds.has(child.id)
    ).length;

    const safety_completeness = totalChildren > 0
      ? completeProfiles / totalChildren
      : 1.0;

    // --- Metric 5: Revenue Capture ---
    const billingEntries = billingResult.data || [];
    const expectedRevenue = billingEntries
      .filter((e: any) => e.status === 'pending' || e.status === 'paid')
      .reduce((sum: number, e: any) => sum + e.amount_cents, 0);
    const collectedRevenue = billingEntries
      .filter((e: any) => e.status === 'paid')
      .reduce((sum: number, e: any) => sum + e.amount_cents, 0);
    const revenue_capture = expectedRevenue > 0
      ? collectedRevenue / expectedRevenue
      : 1.0;

    return NextResponse.json({
      attendance_integrity: Math.round(attendance_integrity * 1000) / 1000,
      capacity_utilization: Math.round(capacity_utilization * 1000) / 1000,
      waitlist_pressure: Math.round(waitlist_pressure * 1000) / 1000,
      safety_completeness: Math.round(safety_completeness * 1000) / 1000,
      revenue_capture: Math.round(revenue_capture * 1000) / 1000,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
