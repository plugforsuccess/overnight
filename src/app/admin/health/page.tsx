'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertCard, EmptyState, FilterBar, MetricCard, PageHeader, SectionCard, StatusBadge, TaskRow, Timeline, TimelineItem } from '@/components/ui/system';

type IssueSeverity = 'critical' | 'warning' | 'info';
type IssueStatus = 'open' | 'reviewed' | 'resolved' | 'ignored';
type FilterTab = 'all' | 'critical' | 'warning' | 'capacity' | 'attendance' | 'waitlist';

interface HealthIssue {
  id: string;
  issue_type: string;
  severity: IssueSeverity;
  status: IssueStatus;
  care_date: string | null;
  child_id: string | null;
  metadata: any;
  detected_at: string;
  resolution_notes: string | null;
}

interface HealthRun {
  id: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  summary: any;
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  capacity_reserved_drift: 'Capacity Reserved Drift',
  capacity_waitlisted_drift: 'Capacity Waitlisted Drift',
  over_capacity_night: 'Over Capacity Night',
  closed_night_with_open_booking: 'Closed Night With Active Bookings',
  missing_attendance_record_for_tonight: 'Missing Attendance Record',
  attendance_checked_out_without_check_in: 'Checked Out Without Check-In',
  attendance_no_show_missing_timestamp: 'No-Show Missing Timestamp',
  attendance_child_mismatch: 'Attendance Child Mismatch',
  attendance_status_inconsistent_with_timestamps: 'Status/Timestamp Inconsistency',
  waitlist_entry_on_closed_night: 'Waitlist on Closed Night',
  available_capacity_with_stale_waitlist: 'Stale Waitlist With Open Capacity',
};

const ISSUE_CATEGORY: Record<string, string> = {
  capacity_reserved_drift: 'capacity',
  capacity_waitlisted_drift: 'capacity',
  over_capacity_night: 'capacity',
  closed_night_with_open_booking: 'capacity',
  missing_attendance_record_for_tonight: 'attendance',
  attendance_checked_out_without_check_in: 'attendance',
  attendance_no_show_missing_timestamp: 'attendance',
  attendance_child_mismatch: 'attendance',
  attendance_status_inconsistent_with_timestamps: 'attendance',
  waitlist_entry_on_closed_night: 'waitlist',
  available_capacity_with_stale_waitlist: 'waitlist',
};

const RECOMMENDED_ACTIONS: Record<string, string> = {
  capacity_reserved_drift: 'Review program capacity counters and run reconciliation',
  capacity_waitlisted_drift: 'Review waitlist counter against actual waitlist entries',
  over_capacity_night: 'Review reservations and consider reducing or cancelling',
  closed_night_with_open_booking: 'Contact affected families or reopen night',
  missing_attendance_record_for_tonight: 'Open Tonight dashboard to initialize records',
  attendance_checked_out_without_check_in: 'Correct attendance record via Tonight dashboard',
  attendance_no_show_missing_timestamp: 'Review and correct no-show record',
  attendance_child_mismatch: 'Investigate data integrity — child does not match reservation',
  attendance_status_inconsistent_with_timestamps: 'Review and correct attendance timestamps',
  waitlist_entry_on_closed_night: 'Remove waitlist entry or reopen night',
  available_capacity_with_stale_waitlist: 'Consider promoting waitlisted families',
};

export default function HealthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<HealthIssue[]>([]);
  const [runs, setRuns] = useState<HealthRun[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [runningCheck, setRunningCheck] = useState(false);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState(false);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const loadData = useCallback(async () => {
    const headers = await getAuthHeaders();
    const [issuesRes, runsRes] = await Promise.all([
      fetch('/api/admin/health/issues?status=open', { headers }),
      fetch('/api/admin/health/runs', { headers }),
    ]);

    if (issuesRes.ok) {
      const { issues: i } = await issuesRes.json();
      setIssues(i || []);
    }
    if (runsRes.ok) {
      const { runs: r } = await runsRes.json();
      setRuns(r || []);
    }
    setLoading(false);
  }, [getAuthHeaders]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }
      loadData();
    }
    init();
  }, [router, loadData]);

  async function handleRunChecks() {
    setRunningCheck(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/health/run', { method: 'POST', headers });
      if (res.ok) {
        await loadData();
      } else {
        const { error } = await res.json();
        alert(`Check failed: ${error}`);
      }
    } finally {
      setRunningCheck(false);
    }
  }

  async function handleResolve(issueId: string, status: IssueStatus) {
    const notes = status === 'resolved' ? prompt('Resolution notes:') : null;
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/health/issues', {
      method: 'POST',
      headers,
      body: JSON.stringify({ issueId, status, resolutionNotes: notes }),
    });
    if (res.ok) {
      setIssues(prev => prev.filter(i => i.id !== issueId));
    }
  }

  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const capacityIssues = issues.filter(i => ISSUE_CATEGORY[i.issue_type] === 'capacity').length;
  const attendanceIssues = issues.filter(i => ISSUE_CATEGORY[i.issue_type] === 'attendance').length;
  const waitlistIssues = issues.filter(i => ISSUE_CATEGORY[i.issue_type] === 'waitlist').length;
  const lastRun = runs[0];

  const filteredIssues = issues.filter(i => {
    if (activeTab === 'critical') return i.severity === 'critical';
    if (activeTab === 'warning') return i.severity === 'warning';
    if (activeTab === 'capacity') return ISSUE_CATEGORY[i.issue_type] === 'capacity';
    if (activeTab === 'attendance') return ISSUE_CATEGORY[i.issue_type] === 'attendance';
    if (activeTab === 'waitlist') return ISSUE_CATEGORY[i.issue_type] === 'waitlist';
    return true;
  });


  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-slate-500">Loading...</div>;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: issues.length },
    { key: 'critical', label: 'Critical', count: criticalCount },
    { key: 'warning', label: 'Warning', count: warningCount },
    { key: 'capacity', label: 'Capacity', count: capacityIssues },
    { key: 'attendance', label: 'Attendance', count: attendanceIssues },
    { key: 'waitlist', label: 'Waitlist', count: waitlistIssues },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operational Health"
        subtitle="Scan integrity issues quickly, resolve them, and keep nightly operations stable."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/admin" className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Back</Link>
            <button
              onClick={handleRunChecks}
              disabled={runningCheck}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <RefreshCw className={cn('h-4 w-4', runningCheck && 'animate-spin')} />
              {runningCheck ? 'Running…' : 'Run checks'}
            </button>
          </div>
        }
      />

      <AlertCard tone={criticalCount > 0 ? 'red' : warningCount > 0 ? 'yellow' : 'green'} title={criticalCount > 0 ? 'Critical action needed' : warningCount > 0 ? 'Review needed' : 'All systems healthy'}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{criticalCount} critical · {warningCount} warnings</span>
          {lastRun && <span className="text-slate-600">Last run: {format(new Date(lastRun.started_at), 'MMM d, h:mm a')}</span>}
        </div>
      </AlertCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Critical" value={criticalCount} tone="red" />
        <MetricCard label="Warnings" value={warningCount} tone="yellow" />
        <MetricCard label="Attendance" value={attendanceIssues} tone="blue" />
        <MetricCard label="Capacity" value={capacityIssues} tone="gray" />
        <MetricCard label="Checks run" value={runs.length} tone="green" />
      </div>

      <FilterBar>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
              activeTab === tab.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700',
            )}
          >
            {tab.label}
            <StatusBadge tone={activeTab === tab.key ? 'gray' : 'blue'}>{tab.count}</StatusBadge>
          </button>
        ))}
      </FilterBar>

      <SectionCard title="Open issues" subtitle="Actionable integrity checks for staff and admin review.">
        {filteredIssues.length === 0 ? (
          <EmptyState
            title={issues.length === 0 ? 'No issues detected' : 'No issues in this filter'}
            description={issues.length === 0 ? 'Run a health check to scan for new issues.' : 'Try another filter to review remaining items.'}
          />
        ) : (
          <div className="space-y-2">
            {filteredIssues.map((issue) => {
              const isExpanded = expandedIssue === issue.id;
              const tone = issue.severity === 'critical' ? 'red' : issue.severity === 'warning' ? 'yellow' : 'blue';
              return (
                <div key={issue.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <TaskRow
                    title={ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}
                    meta={`${RECOMMENDED_ACTIONS[issue.issue_type] || 'Review and investigate'}${issue.care_date ? ` • ${issue.care_date}` : ''}`}
                    status={<StatusBadge tone={tone}>{issue.severity}</StatusBadge>}
                    actions={
                      <>
                        <button onClick={() => handleResolve(issue.id, 'resolved')} className="rounded-md border border-slate-200 px-2 py-1 text-xs">Resolve</button>
                        <button onClick={() => handleResolve(issue.id, 'ignored')} className="rounded-md px-2 py-1 text-xs text-slate-500">Ignore</button>
                        <button onClick={() => setExpandedIssue(isExpanded ? null : issue.id)} className="rounded-md px-2 py-1 text-xs text-slate-500">{isExpanded ? 'Hide' : 'Details'}</button>
                      </>
                    }
                  />
                  {isExpanded && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                      <p className="mb-2 text-slate-500">Detected: {format(new Date(issue.detected_at), 'MMM d, h:mm a')}</p>
                      <pre className="overflow-x-auto">{JSON.stringify(issue.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Check history"
        subtitle="Recent runs and summary counts."
        actions={<button onClick={() => setShowRuns(!showRuns)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">{showRuns ? 'Collapse' : 'Expand'}</button>}
      >
        {!showRuns ? (
          <p className="text-sm text-slate-500">Expand to view past runs.</p>
        ) : runs.length === 0 ? (
          <EmptyState title="No runs yet" description="Run health checks to generate a history log." />
        ) : (
          <Timeline>
            {runs.map((run) => (
              <TimelineItem
                key={run.id}
                title={`${run.run_type} • ${run.status}`}
                time={format(new Date(run.started_at), 'MMM d, h:mm a')}
                tone={run.status === 'failed' ? 'red' : run.status === 'completed' ? 'green' : 'blue'}
                description={run.summary && typeof run.summary === 'object' && run.summary.total !== undefined
                  ? `${run.summary.total} total • ${run.summary.critical || 0} critical • ${run.summary.warning || 0} warning`
                  : undefined}
              />
            ))}
          </Timeline>
        )}
      </SectionCard>
    </div>
  );
}
