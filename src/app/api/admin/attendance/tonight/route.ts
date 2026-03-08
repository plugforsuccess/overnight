import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { ensureAttendanceForDate } from '@/lib/attendance/ensure-attendance-record';
import { format } from 'date-fns';

/**
 * GET /api/admin/attendance/tonight
 * Returns attendance records for tonight with child, parent, allergy,
 * emergency contact, and authorized pickup data.
 * Lazily initializes attendance records for any confirmed nights missing them.
 */
export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = format(new Date(), 'yyyy-MM-dd');

    // Ensure attendance records exist for all confirmed nights tonight
    await ensureAttendanceForDate(supabaseAdmin, today);

    // Fetch attendance records with full child + parent + safety data
    const { data: records, error } = await supabaseAdmin
      .from('attendance_records')
      .select(`
        id, reservation_night_id, child_id, parent_id, care_date,
        attendance_status, check_in_time, check_in_method,
        check_out_time, check_out_method, picked_up_by_name,
        pickup_verification_status, late_arrival_minutes, no_show_marked_at,
        notes,
        child:children(
          id, first_name, last_name, date_of_birth, medical_notes,
          child_allergies(allergen, severity, custom_label),
          child_emergency_contacts(first_name, last_name, phone, relationship),
          child_authorized_pickups(first_name, last_name, relationship, id_verified)
        ),
        parent:parents(id, first_name, last_name, email, phone)
      `)
      .eq('care_date', today)
      .in('attendance_status', ['expected', 'checked_in', 'checked_out', 'no_show']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ records: records || [], date: today });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
