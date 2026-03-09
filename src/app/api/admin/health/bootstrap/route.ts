import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/admin/health/bootstrap
 *
 * Verifies the health system is operational:
 * - health_check_runs table is writable
 * - health_issues table is writable
 * - health runner is not locked (no stuck "running" entries)
 * - event logging is operational (audit_log writable)
 *
 * Returns: { status: 'HEALTH_SYSTEM_OK' | 'HEALTH_SYSTEM_DEGRADED', checks: [...] }
 */
export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: { name: string; status: 'ok' | 'fail'; message: string }[] = [];

  // 1. Health check runs table is writable
  try {
    const { data: testRun, error } = await supabaseAdmin
      .from('health_check_runs')
      .insert({
        run_type: 'bootstrap_test',
        status: 'completed',
        triggered_by_user_id: admin.id,
        completed_at: new Date().toISOString(),
        summary: { bootstrap: true },
      })
      .select('id')
      .single();

    if (error) {
      checks.push({ name: 'health_runs_writable', status: 'fail', message: error.message });
    } else {
      // Clean up test row
      await supabaseAdmin.from('health_check_runs').delete().eq('id', testRun.id);
      checks.push({ name: 'health_runs_writable', status: 'ok', message: 'health_check_runs table is writable' });
    }
  } catch (err: any) {
    checks.push({ name: 'health_runs_writable', status: 'fail', message: err.message });
  }

  // 2. Health issues table is writable
  try {
    const { data: testIssue, error } = await supabaseAdmin
      .from('health_issues')
      .insert({
        issue_type: 'bootstrap_test',
        severity: 'info',
        status: 'resolved',
        metadata: { bootstrap: true },
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: admin.id,
        resolution_notes: 'Bootstrap test — auto-cleaned',
      })
      .select('id')
      .single();

    if (error) {
      checks.push({ name: 'health_issues_writable', status: 'fail', message: error.message });
    } else {
      await supabaseAdmin.from('health_issues').delete().eq('id', testIssue.id);
      checks.push({ name: 'health_issues_writable', status: 'ok', message: 'health_issues table is writable' });
    }
  } catch (err: any) {
    checks.push({ name: 'health_issues_writable', status: 'fail', message: err.message });
  }

  // 3. Health runner not locked (no stuck "running" entries older than 5 minutes)
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from('health_check_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running')
      .lt('created_at', fiveMinutesAgo);

    if (error) {
      checks.push({ name: 'health_runner_not_locked', status: 'fail', message: error.message });
    } else if ((count ?? 0) > 0) {
      checks.push({
        name: 'health_runner_not_locked',
        status: 'fail',
        message: `${count} stuck health check run(s) older than 5 minutes`,
      });
    } else {
      checks.push({ name: 'health_runner_not_locked', status: 'ok', message: 'No stuck health check runs' });
    }
  } catch (err: any) {
    checks.push({ name: 'health_runner_not_locked', status: 'fail', message: err.message });
  }

  // 4. Event logging operational (audit_log writable)
  try {
    const { data: testLog, error } = await supabaseAdmin
      .from('audit_log')
      .insert({
        actor_id: admin.id,
        action: 'health_bootstrap_test',
        entity_type: 'system',
        entity_id: 'bootstrap',
        metadata: { bootstrap: true, timestamp: new Date().toISOString() },
      })
      .select('id')
      .single();

    if (error) {
      checks.push({ name: 'event_logging_operational', status: 'fail', message: error.message });
    } else {
      await supabaseAdmin.from('audit_log').delete().eq('id', testLog.id);
      checks.push({ name: 'event_logging_operational', status: 'ok', message: 'audit_log table is writable' });
    }
  } catch (err: any) {
    checks.push({ name: 'event_logging_operational', status: 'fail', message: err.message });
  }

  const allOk = checks.every(c => c.status === 'ok');

  return NextResponse.json({
    status: allOk ? 'HEALTH_SYSTEM_OK' : 'HEALTH_SYSTEM_DEGRADED',
    checks,
  });
}
