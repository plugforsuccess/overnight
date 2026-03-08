import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ensure an attendance record exists for a given reservation_night.
 * Creates one with status 'expected' if it doesn't exist.
 * Returns the attendance record (existing or newly created).
 */
export async function ensureAttendanceRecord(
  supabase: SupabaseClient,
  reservationNightId: string
) {
  // Check for existing record
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('reservation_night_id', reservationNightId)
    .single();

  if (existing) return existing;

  // Fetch the reservation night to get child_id, parent_id, care_date
  const { data: night, error: nightError } = await supabase
    .from('reservation_nights')
    .select(`
      id, child_id, care_date, reservation_id,
      reservation:reservations(overnight_block_id, overnight_block:overnight_blocks(parent_id, child_id))
    `)
    .eq('id', reservationNightId)
    .single();

  if (nightError || !night) {
    throw new Error(`Reservation night not found: ${reservationNightId}`);
  }

  const block = (night.reservation as any)?.overnight_block;
  const parentId = block?.parent_id;

  if (!parentId) {
    throw new Error(`Cannot resolve parent for reservation night: ${reservationNightId}`);
  }

  // Create the attendance record
  const { data: record, error: insertError } = await supabase
    .from('attendance_records')
    .insert({
      reservation_night_id: reservationNightId,
      child_id: night.child_id,
      parent_id: parentId,
      care_date: night.care_date,
      attendance_status: 'expected',
    })
    .select()
    .single();

  if (insertError) {
    // Race condition: another request created it first
    if (insertError.code === '23505') {
      const { data: raceRecord } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('reservation_night_id', reservationNightId)
        .single();
      return raceRecord;
    }
    throw new Error(`Failed to create attendance record: ${insertError.message}`);
  }

  // Emit creation event
  await supabase.from('attendance_events').insert({
    attendance_record_id: record.id,
    reservation_night_id: reservationNightId,
    child_id: night.child_id,
    event_type: 'attendance_record_created',
    metadata: { care_date: night.care_date },
  });

  return record;
}

/**
 * Ensure attendance records exist for all confirmed reservation nights on a given date.
 * Used by the Tonight dashboard to lazily initialize records.
 */
export async function ensureAttendanceForDate(
  supabase: SupabaseClient,
  careDate: string
) {
  // Find confirmed reservation nights that don't yet have attendance records
  const { data: nights } = await supabase
    .from('reservation_nights')
    .select(`
      id, child_id, care_date, status,
      reservation:reservations(overnight_block_id, overnight_block:overnight_blocks(parent_id))
    `)
    .eq('care_date', careDate)
    .in('status', ['confirmed', 'pending']);

  if (!nights || nights.length === 0) return [];

  // Check which already have attendance records
  const nightIds = nights.map((n: any) => n.id);
  const { data: existingRecords } = await supabase
    .from('attendance_records')
    .select('reservation_night_id')
    .in('reservation_night_id', nightIds);

  const existingSet = new Set((existingRecords || []).map((r: any) => r.reservation_night_id));
  const missing = nights.filter((n: any) => !existingSet.has(n.id));

  // Create missing records
  const toInsert = missing.map((n: any) => ({
    reservation_night_id: n.id,
    child_id: n.child_id,
    parent_id: (n.reservation as any)?.overnight_block?.parent_id,
    care_date: n.care_date,
    attendance_status: 'expected',
  })).filter((r: any) => r.parent_id); // skip if parent can't be resolved

  if (toInsert.length === 0) return existingRecords || [];

  const { data: inserted } = await supabase
    .from('attendance_records')
    .insert(toInsert)
    .select();

  // Emit creation events
  if (inserted && inserted.length > 0) {
    const events = inserted.map((r: any) => ({
      attendance_record_id: r.id,
      reservation_night_id: r.reservation_night_id,
      child_id: r.child_id,
      event_type: 'attendance_record_created',
      metadata: { care_date: r.care_date, batch: true },
    }));
    await supabase.from('attendance_events').insert(events);
  }

  return [...(existingRecords || []), ...(inserted || [])];
}
