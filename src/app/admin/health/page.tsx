'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, AlertTriangle, CheckCircle, Info, RefreshCw,
  Clock, Shield, Activity, ChevronDown, ChevronUp, XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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

  // Overall health status
  const healthStatus = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: issues.length },
    { key: 'critical', label: 'Critical', count: criticalCount },
    { key: 'warning', label: 'Warning', count: warningCount },
    { key: 'capacity', label: 'Capacity', count: capacityIssues },
    { key: 'attendance', label: 'Attendance', count: attendanceIssues },
    { key: 'waitlist', label: 'Waitlist', count: waitlistIssues },
  ];

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
            <p className="text-gray-500">Data integrity, drift detection, and operational health</p>
          </div>
          <button
            onClick={handleRunChecks}
            disabled={runningCheck}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', runningCheck && 'animate-spin')} />
            {runningCheck ? 'Running...' : 'Run Checks'}
          </button>
        </div>

        {/* Health Status Banner */}
        <div className={cn(
          'rounded-lg px-4 py-3 mb-6 flex items-center gap-3',
          healthStatus === 'critical' ? 'bg-red-50 border border-red-200' :
          healthStatus === 'warning' ? 'bg-amber-50 border border-amber-200' :
          'bg-green-50 border border-green-200'
        )}>
          {healthStatus === 'critical' ? (
            <><AlertTriangle className="h-5 w-5 text-red-600" /><span className="font-medium text-red-700">Critical action needed — {criticalCount} critical issue{criticalCount !== 1 ? 's' : ''} detected</span></>
          ) : healthStatus === 'warning' ? (
            <><AlertTriangle className="h-5 w-5 text-amber-600" /><span className="font-medium text-amber-700">Needs review — {warningCount} warning{warningCount !== 1 ? 's' : ''} detected</span></>
          ) : (
            <><CheckCircle className="h-5 w-5 text-green-600" /><span className="font-medium text-green-700">All systems healthy</span></>
          )}
          {lastRun && (
            <span className="text-xs text-gray-500 ml-auto">
              Last check: {format(new Date(lastRun.started_at), 'MMM d, h:mm a')}
            </span>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <div className="card text-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-red-700">{criticalCount}</div>
            <div className="text-xs text-gray-500">Critical</div>
          </div>
          <div className="card text-center">
            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-amber-600">{warningCount}</div>
            <div className="text-xs text-gray-500">Warnings</div>
          </div>
          <div className="card text-center">
            <Activity className="h-5 w-5 text-blue-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-blue-600">{attendanceIssues}</div>
            <div className="text-xs text-gray-500">Attendance</div>
          </div>
          <div className="card text-center">
            <Shield className="h-5 w-5 text-navy-600 mx-auto mb-1" />
            <div className="text-xl font-bold text-navy-700">{capacityIssues}</div>
            <div className="text-xs text-gray-500">Capacity</div>
          </div>
          <div className="card text-center">
            <Clock className="h-5 w-5 text-gray-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-gray-600">{runs.length}</div>
            <div className="text-xs text-gray-500">Checks run</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors flex items-center gap-2',
                activeTab === tab.key
                  ? 'bg-navy-700 text-white'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
              )}
            >
              {tab.label}
              <span className={cn(
                'inline-flex items-center justify-center h-5 min-w-[20px] rounded-full text-xs font-bold',
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600',
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Issue List */}
        {filteredIssues.length === 0 ? (
          <div className="card text-center py-12">
            <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {issues.length === 0 ? 'No issues detected. Run a health check to scan for issues.' : 'No issues in this category.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {filteredIssues.map(issue => {
              const isExpanded = expandedIssue === issue.id;
              return (
                <div key={issue.id} className={cn(
                  'card border-l-4',
                  issue.severity === 'critical' ? 'border-l-red-500' :
                  issue.severity === 'warning' ? 'border-l-amber-400' :
                  'border-l-blue-300'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {issue.severity === 'critical' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3" /> Critical</span>
                        ) : issue.severity === 'warning' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><AlertTriangle className="h-3 w-3" /> Warning</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"><Info className="h-3 w-3" /> Info</span>
                        )}
                        <span className="font-medium text-gray-900">{ISSUE_TYPE_LABELS[issue.issue_type] || issue.issue_type}</span>
                        {issue.care_date && (
                          <span className="text-sm text-gray-500">{issue.care_date}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{RECOMMENDED_ACTIONS[issue.issue_type] || 'Review and investigate'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleResolve(issue.id, 'resolved')}
                        className="btn-secondary text-xs px-2 py-1">Resolve</button>
                      <button onClick={() => handleResolve(issue.id, 'ignored')}
                        className="text-xs text-gray-400 hover:text-gray-600 px-1">Ignore</button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-500 mb-2">Detected: {format(new Date(issue.detected_at), 'MMM d, h:mm a')}</div>
                      <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto">
                        {JSON.stringify(issue.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Run History */}
        <div className="card">
          <button onClick={() => setShowRuns(!showRuns)}
            className="flex items-center justify-between w-full text-left">
            <h2 className="text-lg font-semibold text-gray-900">Check History</h2>
            {showRuns ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </button>
          {showRuns && (
            <div className="mt-4 space-y-2">
              {runs.length === 0 ? (
                <p className="text-sm text-gray-500">No health checks have been run yet.</p>
              ) : runs.map(run => (
                <div key={run.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    {run.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : run.status === 'failed' ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                    )}
                    <span className="text-gray-700 capitalize">{run.run_type}</span>
                    <span className="text-gray-400">{format(new Date(run.started_at), 'MMM d, h:mm a')}</span>
                  </div>
                  {run.summary && typeof run.summary === 'object' && run.summary.total !== undefined && (
                    <div className="flex items-center gap-2 text-xs">
                      {run.summary.critical > 0 && <span className="text-red-600 font-medium">{run.summary.critical} critical</span>}
                      {run.summary.warning > 0 && <span className="text-amber-600 font-medium">{run.summary.warning} warning</span>}
                      {run.summary.info > 0 && <span className="text-blue-600">{run.summary.info} info</span>}
                      {run.summary.total === 0 && <span className="text-green-600">All clear</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
