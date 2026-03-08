import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all active children with related safety data
    const { data: children, error: childError } = await supabaseAdmin
      .from('children')
      .select(`
        id, first_name, last_name, allergies, medical_notes, notes, active,
        parent:parents(id, first_name, last_name, email, phone)
      `)
      .eq('active', true)
      .order('last_name');

    if (childError) {
      return NextResponse.json({ error: childError.message }, { status: 500 });
    }

    // Fetch emergency contacts counts per child
    const { data: emergencyContacts } = await supabaseAdmin
      .from('child_emergency_contacts')
      .select('child_id')
      .is('archived_at', null);

    // Fetch authorized pickups counts per child
    const { data: pickups } = await supabaseAdmin
      .from('child_authorized_pickups')
      .select('child_id')
      .eq('is_active', true);

    // Fetch child allergies with action plans
    const { data: allergies } = await supabaseAdmin
      .from('child_allergies')
      .select('child_id, allergen, severity, action_plan:child_allergy_action_plans(id)');

    // Fetch medical profiles
    const { data: medicalProfiles } = await supabaseAdmin
      .from('child_medical_profiles')
      .select('child_id, has_allergies, has_medications, has_medical_conditions');

    // Fetch most recent attendance per child
    const { data: recentAttendance } = await supabaseAdmin
      .from('child_attendance_sessions')
      .select('child_id, session_date')
      .order('session_date', { ascending: false });

    // Fetch reservations for caregiver notes
    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('child_id, caregiver_notes')
      .not('caregiver_notes', 'is', null);

    // Build lookup maps
    const ecCountMap = new Map<string, number>();
    for (const ec of emergencyContacts || []) {
      ecCountMap.set(ec.child_id, (ecCountMap.get(ec.child_id) || 0) + 1);
    }

    const pickupCountMap = new Map<string, number>();
    for (const p of pickups || []) {
      pickupCountMap.set(p.child_id, (pickupCountMap.get(p.child_id) || 0) + 1);
    }

    const allergyMap = new Map<string, { allergen: string; severity: string; hasActionPlan: boolean }[]>();
    for (const a of allergies || []) {
      const list = allergyMap.get(a.child_id) || [];
      list.push({
        allergen: a.allergen,
        severity: a.severity,
        hasActionPlan: Array.isArray(a.action_plan) ? a.action_plan.length > 0 : !!a.action_plan,
      });
      allergyMap.set(a.child_id, list);
    }

    const medicalMap = new Map<string, any>();
    for (const mp of medicalProfiles || []) {
      medicalMap.set(mp.child_id, mp);
    }

    const lastAttendanceMap = new Map<string, string>();
    for (const att of recentAttendance || []) {
      if (!lastAttendanceMap.has(att.child_id)) {
        lastAttendanceMap.set(att.child_id, att.session_date);
      }
    }

    const caregiverNotesMap = new Map<string, boolean>();
    for (const r of reservations || []) {
      if (r.caregiver_notes) {
        caregiverNotesMap.set(r.child_id, true);
      }
    }

    // Compute safety status for each child
    const result = (children || []).map((child: any) => {
      const ecCount = ecCountMap.get(child.id) || 0;
      const pickupCount = pickupCountMap.get(child.id) || 0;
      const childAllergies = allergyMap.get(child.id) || [];
      const hasCaregiverNotes = caregiverNotesMap.get(child.id) || false;
      const lastAttendance = lastAttendanceMap.get(child.id) || null;
      const medical = medicalMap.get(child.id);

      const issues: { issue: string; severity: 'critical' | 'warning' }[] = [];

      // Critical checks
      if (ecCount === 0) {
        issues.push({ issue: 'No emergency contacts', severity: 'critical' });
      }
      if (pickupCount === 0) {
        issues.push({ issue: 'No authorized pickups', severity: 'critical' });
      }
      // Allergy with no action plan
      const allergiesWithoutPlan = childAllergies.filter(a => !a.hasActionPlan);
      if (allergiesWithoutPlan.length > 0) {
        issues.push({
          issue: `Allergy (${allergiesWithoutPlan.map(a => a.allergen).join(', ')}) without treatment plan`,
          severity: 'critical',
        });
      }

      // Warning checks
      if (ecCount === 1) {
        issues.push({ issue: 'Only one emergency contact', severity: 'warning' });
      }
      if (!hasCaregiverNotes) {
        issues.push({ issue: 'Missing caregiver notes', severity: 'warning' });
      }

      const hasCritical = issues.some(i => i.severity === 'critical');
      const hasWarning = issues.some(i => i.severity === 'warning');
      const safetyStatus = hasCritical ? 'critical' : hasWarning ? 'warning' : 'complete';

      return {
        child_id: child.id,
        name: `${child.first_name} ${child.last_name}`,
        safety_status: safetyStatus,
        emergency_contacts_count: ecCount,
        pickups_count: pickupCount,
        allergy_flags: childAllergies.map(a => a.allergen),
        caregiver_notes_present: hasCaregiverNotes,
        last_attendance_date: lastAttendance,
        issues,
        parent: child.parent,
      };
    });

    // Sort: critical first, then warning, then complete
    const order = { critical: 0, warning: 1, complete: 2 };
    result.sort((a: any, b: any) => order[a.safety_status as keyof typeof order] - order[b.safety_status as keyof typeof order]);

    return NextResponse.json({ children: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
