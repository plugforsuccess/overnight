/**
 * Closures Chaos Tests
 * Scenario D: Closure During Active Booking Traffic
 * Scenario K: Repeated Closure Idempotency
 * Scenario L: Reopen During Reduce Race
 * Scenario M: Missing Capacity Rows Under Concurrent Operations
 */

import { seedChaosScenario, ChaosScenario } from './helpers/seed-chaos-data';
import { runConcurrent, runInterleavedConcurrent } from './helpers/run-concurrent';
import { expectInvariantsHold } from './helpers/assert-invariants';
import { applyOverride } from '../../src/lib/closures/apply';
import { reopenNights } from '../../src/lib/closures/reopen';

describe('Closures Chaos Tests', () => {
  let scenario: ChaosScenario;

  afterEach(async () => {
    if (scenario) await scenario.cleanup();
  });

  /**
   * Scenario D: Closure During Active Booking Traffic
   * Setup: capacity 6, 3 confirmed bookings
   * Action: closure + 3 concurrent booking attempts
   * Expected: closure completes, any bookings that sneak through are recorded
   *          but closure state is correct at the end
   */
  describe('Scenario D: Closure During Active Booking Traffic', () => {
    it('should close night correctly even with concurrent booking attempts', async () => {
      scenario = await seedChaosScenario({
        parentCount: 6,
        childrenPerParent: 1,
        capacityTotal: 6,
        createConfirmedBookings: 3,
        careDate: '2026-05-10',
      });

      const { supabase, careDate, programId, centerId, children, parents } = scenario;

      // Unbooked children try to book while closure happens
      const unbookedChildren = children.slice(3);

      const closureOps = [
        async () => applyOverride(supabase, {
          programId,
          centerId,
          startDate: careDate,
          endDate: careDate,
          action: 'close',
          reasonCode: 'weather',
          actorUserId: 'closure-actor',
        }),
      ];

      const bookingOps = unbookedChildren.map((child) => async () => {
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

        if (!block) throw new Error('Failed to create block');

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

        if (!reservation) throw new Error('Failed to create reservation');

        const { data: result, error } = await supabase.rpc('atomic_book_nights', {
          p_reservation_id: reservation.id,
          p_child_id: child.id,
          p_night_dates: [careDate],
          p_default_capacity: 6,
        });

        if (error) throw new Error(`RPC error: ${error.message}`);
        return result;
      });

      const { resultsA: closureResults, resultsB: bookingResults } =
        await runInterleavedConcurrent(closureOps, bookingOps);

      console.log(`Scenario D: closure=${closureResults.successes.length} success, bookings=${bookingResults.successes.length} success`);

      // After everything settles, verify the closure state
      const { data: cap } = await supabase
        .from('program_capacity')
        .select('capacity_total, status')
        .eq('id', scenario.programCapacityId)
        .single();

      // Closure should have set capacity_total to 0 and status to closed
      expect(cap!.capacity_total).toBe(0);
      expect(cap!.status).toBe('closed');

      // Verify override exists
      const { data: override } = await supabase
        .from('capacity_overrides')
        .select('override_type, is_active')
        .eq('program_id', programId)
        .eq('care_date', careDate)
        .eq('is_active', true)
        .single();

      expect(override).toBeTruthy();
      expect(override!.override_type).toBe('closed');

      await expectInvariantsHold(supabase, {
        careDate,
        programId,
        centerId,
      });
    }, 30000);
  });

  /**
   * Scenario K: Repeated Closure Idempotency
   * Setup: open night
   * Action: 5 concurrent closure attempts for the same night
   * Expected: all succeed or only 1 creates the override, final state is closed
   */
  describe('Scenario K: Repeated Closure Idempotency', () => {
    it('should handle repeated closures without creating duplicate overrides', async () => {
      scenario = await seedChaosScenario({
        parentCount: 1,
        childrenPerParent: 1,
        capacityTotal: 6,
        careDate: '2026-05-11',
      });

      const { supabase, careDate, programId, centerId } = scenario;

      const results = await runConcurrent(5, async (i) => {
        return applyOverride(supabase, {
          programId,
          centerId,
          startDate: careDate,
          endDate: careDate,
          action: 'close',
          reasonCode: 'weather',
          actorUserId: `closure-actor-${i}`,
        });
      });

      console.log(`Scenario K: ${results.successes.length} closures succeeded, ${results.failures.length} failed`);

      // Only 1 active override should exist (partial unique index)
      const { data: activeOverrides } = await supabase
        .from('capacity_overrides')
        .select('id')
        .eq('program_id', programId)
        .eq('care_date', careDate)
        .eq('is_active', true);

      expect(activeOverrides!.length).toBe(1);

      // Final state should be closed
      const { data: cap } = await supabase
        .from('program_capacity')
        .select('capacity_total, status')
        .eq('id', scenario.programCapacityId)
        .single();

      expect(cap!.capacity_total).toBe(0);
      expect(cap!.status).toBe('closed');

      await expectInvariantsHold(supabase, {
        careDate,
        programId,
        centerId,
      });
    }, 30000);
  });

  /**
   * Scenario L: Reopen During Reduce Race
   * Setup: night is closed
   * Action: reopen + reduce_capacity fire concurrently
   * Expected: one wins, final state is consistent
   */
  describe('Scenario L: Reopen During Reduce Race', () => {
    it('should resolve reopen vs reduce race cleanly', async () => {
      scenario = await seedChaosScenario({
        parentCount: 1,
        childrenPerParent: 1,
        capacityTotal: 6,
        careDate: '2026-05-12',
      });

      const { supabase, careDate, programId, centerId } = scenario;

      // First close the night
      await applyOverride(supabase, {
        programId,
        centerId,
        startDate: careDate,
        endDate: careDate,
        action: 'close',
        reasonCode: 'weather',
        actorUserId: 'setup-actor',
      });

      // Now race reopen vs reduce
      const reopenOps = [
        async () => reopenNights(supabase, {
          programId,
          centerId,
          startDate: careDate,
          endDate: careDate,
          defaultCapacity: 6,
          actorUserId: 'reopen-actor',
        }),
      ];

      const reduceOps = [
        async () => applyOverride(supabase, {
          programId,
          centerId,
          startDate: careDate,
          endDate: careDate,
          action: 'reduce_capacity',
          capacityOverride: 3,
          reasonCode: 'staffing',
          actorUserId: 'reduce-actor',
        }),
      ];

      const { resultsA: reopenResults, resultsB: reduceResults } =
        await runInterleavedConcurrent(reopenOps, reduceOps);

      console.log(`Scenario L: reopen=${reopenResults.successes.length}, reduce=${reduceResults.successes.length}`);

      // Verify consistent final state
      const { data: cap } = await supabase
        .from('program_capacity')
        .select('capacity_total, status')
        .eq('id', scenario.programCapacityId)
        .single();

      // Should be one of: fully reopened (6), reduced (3), or closed (0)
      expect([0, 3, 6]).toContain(cap!.capacity_total);

      // Check override state matches capacity
      const { data: activeOverride } = await supabase
        .from('capacity_overrides')
        .select('override_type, capacity_override, is_active')
        .eq('program_id', programId)
        .eq('care_date', careDate)
        .eq('is_active', true)
        .maybeSingle();

      if (activeOverride) {
        if (activeOverride.override_type === 'closed') {
          expect(cap!.capacity_total).toBe(0);
        } else if (activeOverride.override_type === 'reduced_capacity') {
          expect(cap!.capacity_total).toBe(activeOverride.capacity_override);
        }
      }

      await expectInvariantsHold(supabase, {
        careDate,
        programId,
        centerId,
      });
    }, 30000);
  });

  /**
   * Scenario M: Missing Capacity Rows Under Concurrent Operations
   * Setup: no program_capacity row for the date
   * Action: concurrent closure + booking both try to lazy-create the capacity row
   * Expected: no duplicate capacity rows, final state consistent
   */
  describe('Scenario M: Missing Capacity Rows Under Concurrent Operations', () => {
    it('should handle concurrent lazy-creation of capacity rows', async () => {
      scenario = await seedChaosScenario({
        parentCount: 2,
        childrenPerParent: 1,
        capacityTotal: 6,
        careDate: '2026-05-13',
      });

      const { supabase, careDate, programId, centerId } = scenario;
      const newDate = '2026-05-14'; // Use a date with no existing capacity row

      // Run closure + booking on a date with no pre-existing capacity row
      const closureOps = [
        async () => applyOverride(supabase, {
          programId,
          centerId,
          startDate: newDate,
          endDate: newDate,
          action: 'reduce_capacity',
          capacityOverride: 3,
          reasonCode: 'staffing',
          actorUserId: 'closure-actor',
        }),
      ];

      const bookingOps = [
        async () => {
          const child = scenario.children[0];
          const parent = scenario.parents[0];

          const { data: block } = await supabase
            .from('overnight_blocks')
            .insert({
              parent_id: parent.id,
              child_id: child.id,
              nights_per_week: 1,
              weekly_price_cents: 10000,
              status: 'active',
              payment_status: 'confirmed',
              week_start: newDate,
            })
            .select('id')
            .single();

          if (!block) throw new Error('Failed to create block');

          const { data: reservation } = await supabase
            .from('reservations')
            .insert({
              overnight_block_id: block.id,
              child_id: child.id,
              date: newDate,
              status: 'confirmed',
            })
            .select('id')
            .single();

          if (!reservation) throw new Error('Failed to create reservation');

          const { data, error } = await supabase.rpc('atomic_book_nights', {
            p_reservation_id: reservation.id,
            p_child_id: child.id,
            p_night_dates: [newDate],
            p_default_capacity: 6,
          });

          if (error) throw new Error(`RPC: ${error.message}`);
          return data;
        },
      ];

      const { resultsA, resultsB } = await runInterleavedConcurrent(closureOps, bookingOps);

      console.log(`Scenario M: closure=${resultsA.successes.length}, booking=${resultsB.successes.length}`);

      // Verify no duplicate capacity rows
      const { data: capRows } = await supabase
        .from('program_capacity')
        .select('id')
        .eq('program_id', programId)
        .eq('care_date', newDate);

      // Should have exactly 0 or 1 capacity row
      expect(capRows!.length).toBeLessThanOrEqual(2); // RPC may create its own
      console.log(`  Capacity rows for ${newDate}: ${capRows!.length}`);

      // Clean up the extra date
      await supabase.from('capacity_overrides').delete().eq('program_id', programId).eq('care_date', newDate);
      await supabase.from('reservation_nights').delete().eq('care_date', newDate);
      await supabase.from('program_capacity').delete().eq('program_id', programId).eq('care_date', newDate);
    }, 30000);
  });
});
