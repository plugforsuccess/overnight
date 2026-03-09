import { SupabaseClient } from '@supabase/supabase-js';
import { checkCapacity, HealthIssueInput } from './check-capacity';
import { checkAttendance } from './check-attendance';
import { checkWaitlist } from './check-waitlist';

export interface HealthRunResult {
  runId: string;
  status: 'completed' | 'failed';
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
}

/**
 * Run all health checks, persist results, and return summary.
 */
export async function runHealthChecks(
  supabase: SupabaseClient,
  runType: string,
  triggeredByUserId?: string
): Promise<HealthRunResult> {
  // Create run record
  const { data: run, error: runError } = await supabase
    .from('health_check_runs')
    .insert({
      run_type: runType,
      status: 'running',
      triggered_by_user_id: triggeredByUserId || null,
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create health check run: ${runError?.message}`);
  }

  try {
    // Run all checkers
    const [capacityIssues, attendanceIssues, waitlistIssues] = await Promise.all([
      checkCapacity(supabase),
      checkAttendance(supabase),
      checkWaitlist(supabase),
    ]);

    const allIssues: HealthIssueInput[] = [
      ...capacityIssues,
      ...attendanceIssues,
      ...waitlistIssues,
    ];

    // Persist issues
    if (allIssues.length > 0) {
      const rows = allIssues.map(issue => ({
        health_check_run_id: run.id,
        issue_type: issue.issueType,
        severity: issue.severity,
        status: 'open',
        center_id: issue.centerId || null,
        program_id: issue.programId || null,
        care_date: issue.careDate || null,
        reservation_night_id: issue.reservationNightId || null,
        attendance_record_id: issue.attendanceRecordId || null,
        child_id: issue.childId || null,
        metadata: issue.metadata,
      }));

      await supabase.from('health_issues').insert(rows);
    }

    // Compute summary
    const summary = {
      critical: allIssues.filter(i => i.severity === 'critical').length,
      warning: allIssues.filter(i => i.severity === 'warning').length,
      info: allIssues.filter(i => i.severity === 'info').length,
      total: allIssues.length,
    };

    // Update run
    await supabase
      .from('health_check_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        summary,
      })
      .eq('id', run.id);

    return { runId: run.id, status: 'completed', summary };
  } catch (err: any) {
    // Mark run as failed
    await supabase
      .from('health_check_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        summary: { error: err.message },
      })
      .eq('id', run.id);

    throw err;
  }
}
