/**
 * Chaos Test Data Seeding
 * Creates isolated test data for each chaos scenario.
 * Uses supabaseAdmin (service role) to bypass RLS.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Create admin client for chaos tests
export function getTestAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE env vars for chaos tests');
  return createClient(url, key);
}

export interface ChaosParent {
  id: string;
  email: string;
}

export interface ChaosChild {
  id: string;
  parentId: string;
  firstName: string;
}

export interface ChaosScenario {
  supabase: SupabaseClient;
  centerId: string;
  programId: string;
  parents: ChaosParent[];
  children: ChaosChild[];
  careDate: string;
  programCapacityId: string;
  cleanup: () => Promise<void>;
}

let scenarioCounter = 0;

/**
 * Seed a complete chaos scenario with isolated test data.
 */
export async function seedChaosScenario(opts: {
  parentCount: number;
  childrenPerParent: number;
  capacityTotal: number;
  capacityReserved?: number;
  capacityWaitlisted?: number;
  capacityStatus?: string;
  careDate?: string;
  createWaitlistEntries?: number;
  createConfirmedBookings?: number;
  createAttendanceRecords?: boolean;
}): Promise<ChaosScenario> {
  const supabase = getTestAdminClient();
  scenarioCounter++;
  const suffix = `chaos_${scenarioCounter}_${Date.now()}`;
  const careDate = opts.careDate || '2026-04-15';

  // Get or create center
  const { data: center } = await supabase
    .from('centers')
    .select('id')
    .eq('slug', 'chaos-test')
    .single();

  let centerId: string;
  if (center) {
    centerId = center.id;
  } else {
    const { data: newCenter } = await supabase
      .from('centers')
      .insert({ name: 'Chaos Test Center', slug: 'chaos-test', timezone: 'America/New_York' })
      .select('id')
      .single();
    centerId = newCenter!.id;
  }

  // Get or create program
  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('center_id', centerId)
    .eq('name', 'Chaos Overnight')
    .single();

  let programId: string;
  if (program) {
    programId = program.id;
  } else {
    const { data: newProgram } = await supabase
      .from('programs')
      .insert({ center_id: centerId, name: 'Chaos Overnight', care_type: 'overnight' })
      .select('id')
      .single();
    programId = newProgram!.id;
  }

  // Create program_capacity row
  // Delete any existing one for this date first
  await supabase
    .from('program_capacity')
    .delete()
    .eq('program_id', programId)
    .eq('care_date', careDate);

  const { data: capRow } = await supabase
    .from('program_capacity')
    .insert({
      center_id: centerId,
      program_id: programId,
      care_date: careDate,
      capacity_total: opts.capacityTotal,
      capacity_reserved: opts.capacityReserved ?? 0,
      capacity_waitlisted: opts.capacityWaitlisted ?? 0,
      status: opts.capacityStatus ?? 'open',
    })
    .select('id')
    .single();

  const programCapacityId = capRow!.id;

  // Create parents (using test UUIDs that won't conflict)
  const parents: ChaosParent[] = [];
  const children: ChaosChild[] = [];
  const createdIds: { parentIds: string[]; childIds: string[]; blockIds: string[]; reservationIds: string[]; nightIds: string[]; waitlistIds: string[]; attendanceIds: string[] } = {
    parentIds: [], childIds: [], blockIds: [], reservationIds: [], nightIds: [], waitlistIds: [], attendanceIds: [],
  };

  for (let p = 0; p < opts.parentCount; p++) {
    const email = `chaos_p${p}_${suffix}@test.local`;
    const { data: parent } = await supabase
      .from('parents')
      .insert({
        first_name: `Parent${p}`,
        last_name: suffix,
        email,
        role: 'parent',
        is_admin: false,
        onboarding_status: 'complete',
      })
      .select('id')
      .single();

    if (!parent) continue;
    parents.push({ id: parent.id, email });
    createdIds.parentIds.push(parent.id);

    for (let c = 0; c < opts.childrenPerParent; c++) {
      const firstName = `Child${p}_${c}`;
      const { data: child } = await supabase
        .from('children')
        .insert({
          parent_id: parent.id,
          first_name: firstName,
          last_name: suffix,
          date_of_birth: '2022-01-01',
          active: true,
          center_id: centerId,
        })
        .select('id')
        .single();

      if (!child) continue;
      children.push({ id: child.id, parentId: parent.id, firstName });
      createdIds.childIds.push(child.id);

      // Create emergency contact and medical profile so booking validation passes
      await supabase.from('child_emergency_contacts').insert({
        child_id: child.id,
        center_id: centerId,
        first_name: 'Emergency',
        last_name: 'Contact',
        relationship: 'grandparent',
        phone: '555-0100',
        priority: 1,
      });

      await supabase.from('child_medical_profiles').insert({
        child_id: child.id,
        center_id: centerId,
        has_allergies: false,
        has_medications: false,
        has_medical_conditions: false,
      });
    }
  }

  // Create confirmed bookings if requested
  if (opts.createConfirmedBookings && opts.createConfirmedBookings > 0) {
    const count = Math.min(opts.createConfirmedBookings, children.length);
    for (let i = 0; i < count; i++) {
      const child = children[i];
      const parent = parents.find(p => p.id === child.parentId)!;

      const { data: block } = await supabase
        .from('overnight_blocks')
        .insert({
          parent_id: parent.id,
          child_id: child.id,
          nights_per_week: 1,
          weekly_price_cents: 10000,
          status: 'active',
          payment_status: 'confirmed',
          week_start: careDate,
        })
        .select('id')
        .single();

      if (!block) continue;
      createdIds.blockIds.push(block.id);

      const { data: reservation } = await supabase
        .from('reservations')
        .insert({
          overnight_block_id: block.id,
          child_id: child.id,
          date: careDate,
          status: 'confirmed',
        })
        .select('id')
        .single();

      if (!reservation) continue;
      createdIds.reservationIds.push(reservation.id);

      const { data: night } = await supabase
        .from('reservation_nights')
        .insert({
          reservation_id: reservation.id,
          child_id: child.id,
          program_capacity_id: programCapacityId,
          care_date: careDate,
          status: 'confirmed',
          capacity_snapshot: opts.capacityTotal,
        })
        .select('id')
        .single();

      if (night) createdIds.nightIds.push(night.id);
    }

    // Update capacity_reserved counter
    await supabase
      .from('program_capacity')
      .update({ capacity_reserved: count })
      .eq('id', programCapacityId);
  }

  // Create waitlist entries if requested
  if (opts.createWaitlistEntries && opts.createWaitlistEntries > 0) {
    const startIdx = opts.createConfirmedBookings ?? 0;
    const count = Math.min(opts.createWaitlistEntries, children.length - startIdx);
    for (let i = 0; i < count; i++) {
      const child = children[startIdx + i];
      if (!child) continue;

      const { data: entry } = await supabase
        .from('waitlist')
        .insert({
          parent_id: child.parentId,
          child_id: child.id,
          date: careDate,
          status: 'waiting',
        })
        .select('id')
        .single();

      if (entry) createdIds.waitlistIds.push(entry.id);
    }

    // Update capacity_waitlisted counter
    await supabase
      .from('program_capacity')
      .update({ capacity_waitlisted: count })
      .eq('id', programCapacityId);
  }

  // Create attendance records if requested
  if (opts.createAttendanceRecords && createdIds.nightIds.length > 0) {
    for (const nightId of createdIds.nightIds) {
      const { data: night } = await supabase
        .from('reservation_nights')
        .select('child_id, care_date')
        .eq('id', nightId)
        .single();

      if (!night) continue;
      const parentId = children.find(c => c.id === night.child_id)?.parentId;

      const { data: att } = await supabase
        .from('attendance_records')
        .insert({
          reservation_night_id: nightId,
          center_id: centerId,
          child_id: night.child_id,
          parent_id: parentId,
          care_date: night.care_date,
          attendance_status: 'expected',
        })
        .select('id')
        .single();

      if (att) createdIds.attendanceIds.push(att.id);
    }
  }

  // Cleanup function — reverse order of creation
  async function cleanup() {
    await supabase.from('attendance_events').delete().in('attendance_record_id', createdIds.attendanceIds);
    await supabase.from('attendance_records').delete().in('id', createdIds.attendanceIds);
    await supabase.from('waitlist').delete().in('id', createdIds.waitlistIds);
    await supabase.from('reservation_events').delete().in('reservation_id', createdIds.reservationIds);
    await supabase.from('reservation_nights').delete().in('id', createdIds.nightIds);
    await supabase.from('reservations').delete().in('id', createdIds.reservationIds);
    await supabase.from('overnight_blocks').delete().in('id', createdIds.blockIds);
    // Clean children's related data
    for (const cid of createdIds.childIds) {
      await supabase.from('child_emergency_contacts').delete().eq('child_id', cid);
      await supabase.from('child_medical_profiles').delete().eq('child_id', cid);
    }
    await supabase.from('children').delete().in('id', createdIds.childIds);
    await supabase.from('parents').delete().in('id', createdIds.parentIds);
    await supabase.from('program_capacity').delete().eq('id', programCapacityId);
    // Clean overrides if any were created during tests
    await supabase.from('capacity_overrides').delete().eq('program_id', programId).eq('care_date', careDate);
    // Clean health check data
    await supabase.from('health_issues').delete().eq('care_date', careDate);
  }

  return {
    supabase,
    centerId,
    programId,
    parents,
    children,
    careDate,
    programCapacityId,
    cleanup,
  };
}
