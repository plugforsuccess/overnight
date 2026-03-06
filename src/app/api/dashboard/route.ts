import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized } from '@/lib/api-auth';
import type { DashboardData, DashboardChild, DashboardAllergyInfo } from '@/types/dashboard';

/**
 * GET /api/dashboard
 * Aggregated dashboard data for the authenticated parent.
 * Returns profile, children with safety info, next reservation,
 * subscriptions, and billing summary.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { supabase, parentId } = auth;

  // Fetch all dashboard data in parallel
  const [
    profileRes,
    childrenRes,
    reservationsRes,
    waitlistRes,
    subscriptionsRes,
    blocksRes,
  ] = await Promise.all([
    supabase
      .from('parents')
      .select('first_name, last_name, email, phone, stripe_customer_id')
      .eq('id', parentId)
      .single(),
    supabase
      .from('children')
      .select(`
        id, first_name, last_name, date_of_birth, medical_notes,
        child_allergies(id, allergen, custom_label, severity, child_allergy_action_plans(id, treatment_first_line)),
        child_emergency_contacts(id),
        child_authorized_pickups(id)
      `)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true }),
    supabase
      .from('reservations')
      .select('id, date, status, child:children(first_name, last_name)')
      .eq('child_id', parentId) // join through overnight_blocks
      .gte('date', new Date().toISOString().split('T')[0])
      .in('status', ['confirmed', 'pending_payment'])
      .order('date', { ascending: true })
      .limit(10),
    supabase
      .from('waitlist')
      .select('id')
      .eq('parent_id', parentId)
      .in('status', ['waiting', 'offered']),
    supabase
      .from('subscriptions')
      .select('id, plan_tier, status, next_billing_date')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('overnight_blocks')
      .select('id, weekly_price_cents, status')
      .eq('parent_id', parentId)
      .eq('status', 'active'),
  ]);

  if (profileRes.error || !profileRes.data) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }

  // Transform children data
  const dashboardChildren: DashboardChild[] = (childrenRes.data || []).map((child: any) => {
    const allergies: DashboardAllergyInfo[] = (child.child_allergies || []).map((a: any) => {
      const actionPlans = a.child_allergy_action_plans || [];
      const hasTreatment = actionPlans.length > 0 && actionPlans[0].treatment_first_line !== 'NONE';
      return {
        id: a.id,
        display_name: a.allergen === 'OTHER' ? (a.custom_label || 'Other') : formatAllergen(a.allergen),
        severity: a.severity,
        has_treatment: hasTreatment,
      };
    });

    return {
      id: child.id,
      first_name: child.first_name,
      last_name: child.last_name,
      date_of_birth: child.date_of_birth,
      has_medical_notes: !!child.medical_notes,
      allergies,
      emergency_contacts_count: (child.child_emergency_contacts || []).length,
      authorized_pickups_count: (child.child_authorized_pickups || []).length,
    };
  });

  // Get next reservation using a different query approach
  // Query reservations through the overnight_blocks join
  let nextReservation = null;
  if (dashboardChildren.length > 0) {
    const childIds = dashboardChildren.map(c => c.id);
    const { data: nextResData } = await supabase
      .from('reservations')
      .select('id, date, status, child:children(first_name, last_name)')
      .in('child_id', childIds)
      .gte('date', new Date().toISOString().split('T')[0])
      .in('status', ['confirmed', 'pending_payment'])
      .order('date', { ascending: true })
      .limit(1)
      .single();

    if (nextResData) {
      const childData = nextResData.child as any;
      nextReservation = {
        id: nextResData.id,
        date: nextResData.date,
        status: nextResData.status,
        child_first_name: childData?.first_name || '',
        child_last_name: childData?.last_name || '',
      };
    }
  }

  // Compute upcoming reservation count
  let upcomingCount = 0;
  if (dashboardChildren.length > 0) {
    const childIds = dashboardChildren.map(c => c.id);
    const { count } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .in('child_id', childIds)
      .gte('date', new Date().toISOString().split('T')[0])
      .eq('status', 'confirmed');
    upcomingCount = count || 0;
  }

  // Weekly total from active blocks
  const weeklyTotalCents = (blocksRes.data || []).reduce(
    (sum: number, block: any) => sum + (block.weekly_price_cents || 0),
    0
  );

  const data: DashboardData = {
    profile: {
      first_name: profileRes.data.first_name,
      last_name: profileRes.data.last_name,
      email: profileRes.data.email,
      phone: profileRes.data.phone,
      stripe_customer_id: profileRes.data.stripe_customer_id,
    },
    children: dashboardChildren,
    nextReservation,
    subscriptions: (subscriptionsRes.data || []).map((s: any) => ({
      id: s.id,
      plan_tier: s.plan_tier,
      status: s.status,
      next_billing_date: s.next_billing_date,
    })),
    weeklyTotalCents,
    upcomingReservationsCount: upcomingCount,
    waitlistCount: (waitlistRes.data || []).length,
  };

  return NextResponse.json(data);
}

function formatAllergen(allergen: string): string {
  const labels: Record<string, string> = {
    PEANUT: 'Peanut',
    TREE_NUT: 'Tree Nut',
    MILK: 'Milk',
    EGG: 'Egg',
    WHEAT: 'Wheat',
    SOY: 'Soy',
    FISH: 'Fish',
    SHELLFISH: 'Shellfish',
    SESAME: 'Sesame',
    PENICILLIN: 'Penicillin',
    INSECT_STING: 'Insect Sting',
    LATEX: 'Latex',
    ASTHMA: 'Asthma',
    ENVIRONMENTAL: 'Environmental',
  };
  return labels[allergen] || allergen;
}
