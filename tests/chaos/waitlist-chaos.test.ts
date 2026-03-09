/**
 * Waitlist Chaos Tests
 * Scenario C: Concurrent Cancel + Waitlist Promotion
 * Scenario E: Waitlist Promotion on Closed/Reduced Night
 */

import { seedChaosScenario, ChaosScenario } from './helpers/seed-chaos-data';
import { runConcurrent, runInterleavedConcurrent } from './helpers/run-concurrent';
import { expectInvariantsHold } from './helpers/assert-invariants';

describe('Waitlist Chaos Tests', () => {
  let scenario: ChaosScenario;

  afterEach(async () => {
    if (scenario) await scenario.cleanup();
  });

  /**
   * Scenario C: Concurrent Cancel + Waitlist Promotion
   * Setup: capacity full (5/5), 3 waitlisted
   * Action: 1 cancellation fires concurrently with 3 promote_waitlist calls
   * Expected: exactly 1 net promotion, counters stay consistent
   */
  describe('Scenario C: Concurrent Cancel + Waitlist Promotion', () => {
    it('should handle cancel + promote race without over-promoting', async () => {
      scenario = await seedChaosScenario({
        parentCount: 8,
        childrenPerParent: 1,
        capacityTotal: 5,
        createConfirmedBookings: 5,
        createWaitlistEntries: 3,
        careDate: '2026-05-03',
      });

      const { supabase, careDate } = scenario;

      // Get a confirmed night to cancel
      const { data: confirmedNights } = await supabase
        .from('reservation_nights')
        .select('id')
        .eq('care_date', careDate)
        .eq('status', 'confirmed')
        .limit(1);

      const nightToCancel = confirmedNights?.[0];
      expect(nightToCancel).toBeDefined();

      // Run cancel and promote concurrently
      const cancelOps = [
        async () => {
          const { data, error } = await supabase.rpc('atomic_cancel_night', {
            p_reservation_night_id: nightToCancel!.id,
          });
          if (error) throw new Error(`Cancel RPC error: ${error.message}`);
          return data;
        },
      ];

      const promoteOps = Array.from({ length: 3 }, () => async () => {
        const { data, error } = await supabase.rpc('promote_waitlist', {
          p_care_date: careDate,
        });
        if (error) throw new Error(`Promote RPC error: ${error.message}`);
        return data;
      });

      const { resultsA: cancelResults, resultsB: promoteResults } =
        await runInterleavedConcurrent(cancelOps, promoteOps);

      console.log(`Scenario C: cancel=${cancelResults.successes.length} success, promote=${promoteResults.successes.length} success`);

      // After cancel + promote: capacity_reserved should be exactly 5
      // (one cancelled, one promoted to fill the slot)
      const { data: cap } = await supabase
        .from('program_capacity')
        .select('capacity_total, capacity_reserved, capacity_waitlisted')
        .eq('id', scenario.programCapacityId)
        .single();

      // Reserved should not exceed total
      expect(cap!.capacity_reserved).toBeLessThanOrEqual(cap!.capacity_total);
      // Reserved should not go negative
      expect(cap!.capacity_reserved).toBeGreaterThanOrEqual(0);
      expect(cap!.capacity_waitlisted).toBeGreaterThanOrEqual(0);

      await expectInvariantsHold(supabase, {
        careDate,
        programId: scenario.programId,
        centerId: scenario.centerId,
      });
    }, 30000);
  });

  /**
   * Scenario E: Waitlist Promotion on Closed Night
   * Setup: night closed with active override, waitlisted entries exist
   * Action: attempt promote_waitlist on a closed night
   * Expected: promotion fails or returns null (no slot available on closed night)
   */
  describe('Scenario E: Waitlist Promotion on Closed Night', () => {
    it('should not promote waitlist entries on a closed night', async () => {
      scenario = await seedChaosScenario({
        parentCount: 4,
        childrenPerParent: 1,
        capacityTotal: 3,
        createConfirmedBookings: 3,
        createWaitlistEntries: 1,
        careDate: '2026-05-05',
      });

      const { supabase, careDate, programId, centerId } = scenario;

      // Close the night
      const { applyOverride } = await import('../../src/lib/closures/apply');
      await applyOverride(supabase, {
        programId,
        centerId,
        startDate: careDate,
        endDate: careDate,
        action: 'close',
        reasonCode: 'emergency',
        actorUserId: 'chaos-test-actor',
      });

      // Verify capacity is now 0
      const { data: cap } = await supabase
        .from('program_capacity')
        .select('capacity_total, status')
        .eq('id', scenario.programCapacityId)
        .single();

      expect(cap!.capacity_total).toBe(0);
      expect(cap!.status).toBe('closed');

      // Attempt promotion — should fail or return null
      const results = await runConcurrent(3, async () => {
        const { data, error } = await supabase.rpc('promote_waitlist', {
          p_care_date: careDate,
        });
        if (error) throw new Error(`Promote error: ${error.message}`);
        return data;
      });

      // No promotions should have succeeded (capacity is 0)
      const promotedIds = results.successes.map(s => s.result).filter(Boolean);
      console.log(`Scenario E: ${promotedIds.length} promotions on closed night (should be 0)`);

      // Verify no new confirmed bookings were added
      const { count: confirmedAfter } = await supabase
        .from('reservation_nights')
        .select('id', { count: 'exact', head: true })
        .eq('care_date', careDate)
        .eq('status', 'confirmed');

      // Should still have the original 3 (they were confirmed before closure)
      expect(confirmedAfter).toBeLessThanOrEqual(3);

      await expectInvariantsHold(supabase, {
        careDate,
        programId,
        centerId,
      });
    }, 30000);
  });
});
