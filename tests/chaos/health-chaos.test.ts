/**
 * Health Chaos Tests
 * Scenario J: Health Checks During Active Mutations
 * Scenario O: Health Issue Deduplication
 */

import { seedChaosScenario, ChaosScenario } from './helpers/seed-chaos-data';
import { runConcurrent, runInterleavedConcurrent } from './helpers/run-concurrent';
import { expectInvariantsHold } from './helpers/assert-invariants';
import { runHealthChecks } from '../../src/lib/health/run-health-checks';
import { checkInChild } from '../../src/lib/attendance/check-in';
import { applyOverride } from '../../src/lib/closures/apply';

describe('Health Chaos Tests', () => {
  let scenario: ChaosScenario;

  afterEach(async () => {
    if (scenario) await scenario.cleanup();
  });

  /**
   * Scenario J: Health Checks During Active Mutations
   * Setup: active bookings and attendance records
   * Action: health check runs concurrently with check-ins, closures, and bookings
   * Expected: health check completes without error, may detect transient issues
   */
  describe('Scenario J: Health Checks During Active Mutations', () => {
    it('should complete health checks without crashing during mutations', async () => {
      scenario = await seedChaosScenario({
        parentCount: 4,
        childrenPerParent: 1,
        capacityTotal: 6,
        createConfirmedBookings: 3,
        createAttendanceRecords: true,
        careDate: '2026-05-15',
      });

      const { supabase, careDate, programId, centerId, children } = scenario;

      // Get reservation nights for check-in
      const { data: nights } = await supabase
        .from('reservation_nights')
        .select('id')
        .eq('care_date', careDate)
        .eq('status', 'confirmed');

      const nightIds = (nights || []).map(n => n.id);

      // Run health check concurrently with mutations
      const healthOps = [
        async () => runHealthChecks(supabase, 'chaos_test'),
      ];

      const mutationOps = [
        // Check in a child
        async () => {
          if (nightIds.length > 0) {
            return checkInChild(supabase, {
              reservationNightId: nightIds[0],
              actorUserId: 'mutation-actor',
            });
          }
          return null;
        },
        // Apply a capacity reduction
        async () => applyOverride(supabase, {
          programId,
          centerId,
          startDate: careDate,
          endDate: careDate,
          action: 'reduce_capacity',
          capacityOverride: 4,
          reasonCode: 'staffing',
          actorUserId: 'mutation-actor',
        }),
      ];

      const { resultsA: healthResults, resultsB: mutationResults } =
        await runInterleavedConcurrent(healthOps, mutationOps);

      // Health check should complete (success or with detected issues, not crash)
      expect(healthResults.successes.length).toBe(1);

      const healthResult = healthResults.successes[0].result;
      console.log(`Scenario J: Health check completed with status=${healthResult.status}`);
      console.log(`  Issues found: ${healthResult.summary.total} (${healthResult.summary.critical} critical)`);

      // Verify health check run was recorded
      const { data: run } = await supabase
        .from('health_check_runs')
        .select('status, summary')
        .eq('id', healthResult.runId)
        .single();

      expect(run).toBeTruthy();
      expect(['completed', 'failed']).toContain(run!.status);

      // Clean up health data
      await supabase.from('health_issues').delete().eq('health_check_run_id', healthResult.runId);
      await supabase.from('health_check_runs').delete().eq('id', healthResult.runId);
    }, 30000);
  });

  /**
   * Scenario O: Health Issue Deduplication
   * Setup: create a known issue state
   * Action: run health checks 3 times concurrently
   * Expected: issues may be duplicated across runs (each run creates its own)
   *          but runs themselves complete correctly
   */
  describe('Scenario O: Health Issue Deduplication', () => {
    it('should handle concurrent health check runs without crashing', async () => {
      scenario = await seedChaosScenario({
        parentCount: 2,
        childrenPerParent: 1,
        capacityTotal: 3,
        capacityReserved: 5, // Intentional drift to trigger capacity issue
        createConfirmedBookings: 2,
        careDate: '2026-05-16',
      });

      const { supabase, careDate, programId, centerId } = scenario;

      // Intentionally set capacity_reserved higher than actual to create drift
      await supabase
        .from('program_capacity')
        .update({ capacity_reserved: 5 })
        .eq('id', scenario.programCapacityId);

      // Run 3 concurrent health checks
      const results = await runConcurrent(3, async (i) => {
        return runHealthChecks(supabase, 'chaos_test');
      });

      console.log(`Scenario O: ${results.successes.length} health runs completed, ${results.failures.length} failed`);

      // All runs should complete
      expect(results.successes.length).toBe(3);

      // Each run should have detected the capacity drift
      const runIds = results.successes.map(s => s.result.runId);

      for (const runId of runIds) {
        const { data: issues } = await supabase
          .from('health_issues')
          .select('issue_type, severity')
          .eq('health_check_run_id', runId);

        // Each run should have found at least 1 issue (the capacity drift)
        expect(issues!.length).toBeGreaterThanOrEqual(1);
        console.log(`  Run ${runId.slice(0, 8)}: ${issues!.length} issues`);
      }

      // Clean up health data
      for (const runId of runIds) {
        await supabase.from('health_issues').delete().eq('health_check_run_id', runId);
        await supabase.from('health_check_runs').delete().eq('id', runId);
      }
    }, 30000);
  });
});
