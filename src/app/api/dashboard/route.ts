import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized } from '@/lib/api-auth';
import type { DashboardData, DashboardChild, DashboardAllergyInfo, DashboardUpcomingNight, DashboardNotification } from '@/types/dashboard';
import { OVERNIGHT_START } from '@/lib/constants';

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
      .select('first_name, last_name, email, phone, stripe_customer_id, onboarding_status')
      .eq('id', parentId)
      .single(),
    supabase
      .from('children')
      .select(`
        id, first_name, last_name, date_of_birth, medical_notes,
        child_allergies(id, allergen, custom_label, severity, child_allergy_action_plans(id, treatment_first_line)),
        child_emergency_contacts(id),
        child_authorized_pickups(id),
        child_medical_profiles(id)
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
      has_medical_profile: (child.child_medical_profiles || []).length > 0,
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

  // Fetch upcoming nights list (next 28 days, up to 20)
  let upcomingNights: DashboardUpcomingNight[] = [];
  let upcomingCount = 0;
  if (dashboardChildren.length > 0) {
    const childIds = dashboardChildren.map((c: DashboardChild) => c.id);
    const { data: upcomingData } = await supabase
      .from('reservations')
      .select('id, date, status, child:children(first_name, last_name)')
      .in('child_id', childIds)
      .gte('date', new Date().toISOString().split('T')[0])
      .in('status', ['confirmed', 'pending_payment', 'waitlisted'])
      .order('date', { ascending: true })
      .limit(20);

    upcomingNights = (upcomingData || []).map((r: any) => {
      const childData = r.child as any;
      return {
        id: r.id,
        date: r.date,
        status: r.status,
        child_first_name: childData?.first_name || '',
        child_last_name: childData?.last_name || '',
      };
    });

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

  // Calculate profile completeness percentage
  const completenessItems = {
    hasChildren: dashboardChildren.length > 0,
    hasMedicalProfile: dashboardChildren.some(c => c.has_medical_profile),
    hasEmergencyContacts: dashboardChildren.some(c => c.emergency_contacts_count > 0),
    hasAuthorizedPickups: dashboardChildren.some(c => c.authorized_pickups_count > 0),
  };
  const completedCount = Object.values(completenessItems).filter(Boolean).length;
  const profileCompleteness = Math.round((completedCount / Object.keys(completenessItems).length) * 100);

  // Generate notifications from existing data
  const notifications: DashboardNotification[] = [];
  const today = new Date().toISOString().split('T')[0];

  // Tonight's dropoff reminder
  const tonightNights = upcomingNights.filter((n: DashboardUpcomingNight) => n.date === today && n.status === 'confirmed');
  if (tonightNights.length > 0) {
    const childNames = Array.from(new Set(tonightNights.map((n: DashboardUpcomingNight) => n.child_first_name)));
    notifications.push({
      id: `tonight-${today}`,
      type: 'reminder',
      title: 'Dropoff tonight',
      message: `${childNames.join(' & ')}'s overnight care starts at ${OVERNIGHT_START}.`,
      actionLabel: 'View details',
      actionHref: '/dashboard/reservations',
    });
  }

  // Waitlist promotions (check for recently promoted nights in the upcoming list)
  const promotedNights = upcomingNights.filter((n: DashboardUpcomingNight) => n.status === 'confirmed');
  // Check recent reservation events for promotions
  if (dashboardChildren.length > 0) {
    const childIds = dashboardChildren.map((c: DashboardChild) => c.id);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const { data: recentPromotions } = await supabase
      .from('reservation_events')
      .select('id, event_type, event_data, created_at, reservation:reservations(date, child:children(first_name))')
      .eq('event_type', 'waitlist_promoted')
      .gte('created_at', threeDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentPromotions && recentPromotions.length > 0) {
      for (const promo of recentPromotions) {
        const res = promo.reservation as any;
        if (!res) continue;
        const childData = res.child as any;
        const childName = childData?.first_name || '';
        // Only include if the child belongs to this parent
        const promoChildId = promo.event_data?.child_id;
        if (promoChildId && !childIds.includes(promoChildId)) continue;
        notifications.push({
          id: `promo-${promo.id}`,
          type: 'promotion',
          title: 'Waitlist promotion',
          message: `${childName}'s waitlisted night (${res.date}) was confirmed.`,
          actionLabel: 'View booking',
          actionHref: '/dashboard/reservations',
        });
      }
    }
  }

  // Waitlisted nights warning
  const waitlistedNights = upcomingNights.filter((n: DashboardUpcomingNight) => n.status === 'waitlisted');
  if (waitlistedNights.length > 0) {
    notifications.push({
      id: `waitlist-${today}`,
      type: 'warning',
      title: `${waitlistedNights.length} night${waitlistedNights.length > 1 ? 's' : ''} waitlisted`,
      message: `You'll be notified if a spot opens up.`,
      actionLabel: 'View reservations',
      actionHref: '/dashboard/reservations',
    });
  }

  const data: DashboardData = {
    profile: {
      first_name: profileRes.data.first_name,
      last_name: profileRes.data.last_name,
      email: profileRes.data.email,
      phone: profileRes.data.phone,
      stripe_customer_id: profileRes.data.stripe_customer_id,
      onboarding_status: profileRes.data.onboarding_status || 'started',
    },
    children: dashboardChildren,
    nextReservation,
    upcomingNights,
    notifications,
    subscriptions: (subscriptionsRes.data || []).map((s: any) => ({
      id: s.id,
      plan_tier: s.plan_tier,
      status: s.status,
      next_billing_date: s.next_billing_date,
    })),
    weeklyTotalCents,
    upcomingReservationsCount: upcomingCount,
    waitlistCount: (waitlistRes.data || []).length,
    profileCompleteness,
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
