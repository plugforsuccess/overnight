'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
  Activity,
  ArrowLeft,
  RefreshCw,
  Filter,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';

interface IncidentEvent {
  event_id: string;
  event_type: string;
  child_id: string | null;
  child_name: string | null;
  timestamp: string;
  metadata: Record<string, any>;
  severity: string;
  source: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  reservation_night_created: 'Night Booked',
  reservation_night_confirmed: 'Night Confirmed',
  waitlist_promoted: 'Waitlist Promoted',
  reservation_night_cancelled: 'Night Cancelled',
  child_checked_in: 'Checked In',
  child_checked_out: 'Checked Out',
  attendance_status_corrected: 'Attendance Corrected',
  no_show_marked: 'No-Show',
  attendance_record_created: 'Attendance Record Created',
  capacity_override_applied: 'Capacity Override',
  capacity_override_deactivated: 'Override Removed',
  night_closed: 'Night Closed',
  night_reopened: 'Night Reopened',
  capacity_reduced: 'Capacity Reduced',
};

export default function IncidentsDashboard() {
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ total: 0, limit: 100, offset: 0 });
  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const params = new URLSearchParams({ limit: '100', offset: '0' });
    if (severityFilter !== 'all') params.set('severity', severityFilter);

    const res = await fetch(`/api/admin/incidents?${params}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setEvents(json.events || []);
      setPagination(json.pagination || { total: 0, limit: 100, offset: 0 });
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [severityFilter]);

  const severityCounts = {
    critical: events.filter(e => e.severity === 'critical').length,
    warning: events.filter(e => e.severity === 'warning').length,
    info: events.filter(e => e.severity === 'info').length,
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5 text-gray-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Incident & Event Monitor</h1>
              <p className="text-sm text-gray-500">{pagination.total} events</p>
            </div>
          </div>
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-700">{severityCounts.critical}</p>
                <p className="text-sm text-gray-500">Critical</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{severityCounts.warning}</p>
                <p className="text-sm text-gray-500">Warnings</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Info className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{severityCounts.info}</p>
                <p className="text-sm text-gray-500">Info</p>
              </div>
            </div>
          </div>
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-gray-400" />
          {(['all', 'critical', 'warning', 'info'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                severityFilter === s
                  ? 'bg-navy-100 text-navy-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Event Timeline */}
        {loading ? (
          <div className="card p-8 text-center text-gray-500">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">No events found.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Child</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Event</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map(event => (
                  <tr
                    key={event.event_id}
                    className={`hover:bg-gray-50 cursor-pointer ${
                      event.severity === 'critical' ? 'border-l-4 border-l-red-400' :
                      event.severity === 'warning' ? 'border-l-4 border-l-amber-400' :
                      'border-l-4 border-l-transparent'
                    }`}
                    onClick={() => setExpandedEvent(expandedEvent === event.event_id ? null : event.event_id)}
                  >
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatTime(event.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {event.child_name || <span className="text-gray-400">System</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700">
                        {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                      </span>
                      <span className="ml-2 text-xs text-gray-400">{event.source}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        event.severity === 'critical' ? 'bg-red-50 text-red-700' :
                        event.severity === 'warning' ? 'bg-amber-50 text-amber-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-gray-400 hover:text-gray-600">
                        {expandedEvent === event.event_id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Expanded event detail */}
            {expandedEvent && (() => {
              const event = events.find(e => e.event_id === expandedEvent);
              if (!event) return null;
              return (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Event Metadata</h4>
                  <pre className="text-xs text-gray-600 bg-white p-3 rounded border overflow-x-auto">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
