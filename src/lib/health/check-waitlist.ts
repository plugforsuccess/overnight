import { SupabaseClient } from '@supabase/supabase-js';
import { HealthIssueInput } from './check-capacity';

/**
 * Check waitlist-related integrity issues.
 * - waitlist_entry_on_closed_night
 * - available_capacity_with_stale_waitlist
 */
export async function checkWaitlist(
  supabase: SupabaseClient
): Promise<HealthIssueInput[]> {
  const issues: HealthIssueInput[] = [];
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  // Active waitlist entries for upcoming dates
  const { data: waitlist } = await supabase
    .from('waitlist')
    .select('id, date, child_id, parent_id, status, created_at')
    .in('status', ['waiting', 'offered'])
    .gte('date', today)
    .lte('date', future);

  if (!waitlist || waitlist.length === 0) return issues;

  const dates = Array.from(new Set(waitlist.map((w: any) => w.date)));

  // Check for closed nights with waitlist entries
  const { data: overrides } = await supabase
    .from('capacity_overrides')
    .select('care_date, override_type, program_id')
    .eq('is_active', true)
    .in('care_date', dates);

  const closedDates = new Set<string>();
  (overrides || []).forEach((o: any) => {
    if (o.override_type === 'closed') closedDates.add(o.care_date);
  });

  // Check capacity availability per date
  const { data: capacityRows } = await supabase
    .from('program_capacity')
    .select('care_date, capacity_total, capacity_reserved, status')
    .in('care_date', dates);

  const capacityMap = new Map<string, any>();
  (capacityRows || []).forEach((r: any) => capacityMap.set(r.care_date, r));

  for (const entry of waitlist) {
    // waitlist_entry_on_closed_night
    if (closedDates.has(entry.date)) {
      issues.push({
        issueType: 'waitlist_entry_on_closed_night',
        severity: 'warning',
        careDate: entry.date,
        childId: entry.child_id,
        metadata: {
          waitlist_id: entry.id,
          waitlist_status: entry.status,
        },
      });
    }
  }

  // available_capacity_with_stale_waitlist — per-date
  for (const date of dates) {
    if (closedDates.has(date)) continue;
    const cap = capacityMap.get(date);
    if (!cap) continue;

    const openSpots = cap.capacity_total - cap.capacity_reserved;
    const waitlistForDate = waitlist.filter((w: any) => w.date === date);
    if (openSpots > 0 && waitlistForDate.length > 0) {
      issues.push({
        issueType: 'available_capacity_with_stale_waitlist',
        severity: 'warning',
        careDate: date,
        metadata: {
          open_spots: openSpots,
          waiting_count: waitlistForDate.length,
          capacity_total: cap.capacity_total,
          capacity_reserved: cap.capacity_reserved,
        },
      });
    }
  }

  return issues;
}
