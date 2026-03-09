'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Phone,
  Users,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

interface SafetyChild {
  child_id: string;
  name: string;
  safety_status: 'complete' | 'warning' | 'critical';
  emergency_contacts_count: number;
  pickups_count: number;
  allergy_flags: string[];
  caregiver_notes_present: boolean;
  last_attendance_date: string | null;
  issues: { issue: string; severity: 'critical' | 'warning' }[];
  parent: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | null;
}

export default function SafetyDashboard() {
  const [children, setChildren] = useState<SafetyChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'complete'>('all');
  const fetchData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch('/api/admin/safety', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setChildren(json.children || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const counts = {
    complete: children.filter(c => c.safety_status === 'complete').length,
    warning: children.filter(c => c.safety_status === 'warning').length,
    critical: children.filter(c => c.safety_status === 'critical').length,
  };

  const filtered = filter === 'all' ? children : children.filter(c => c.safety_status === filter);

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
              <h1 className="text-2xl font-bold text-gray-900">Safety & Compliance</h1>
              <p className="text-sm text-gray-500">{children.length} children enrolled</p>
            </div>
          </div>
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setFilter(filter === 'complete' ? 'all' : 'complete')}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{counts.complete}</p>
                <p className="text-sm text-gray-500">Children Complete</p>
              </div>
            </div>
          </div>
          <div
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{counts.warning}</p>
                <p className="text-sm text-gray-500">Warnings</p>
              </div>
            </div>
          </div>
          <div
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-700">{counts.critical}</p>
                <p className="text-sm text-gray-500">Critical Safety Issues</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'critical', 'warning', 'complete'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                filter === f
                  ? 'bg-navy-100 text-navy-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className="ml-1.5 text-xs">
                  {f === 'critical' ? counts.critical : f === 'warning' ? counts.warning : counts.complete}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Safety Issues Table */}
        {loading ? (
          <div className="card p-8 text-center text-gray-500">Loading safety data...</div>
        ) : filtered.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            {filter === 'all' ? 'No children found.' : `No ${filter} issues.`}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Child</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Issues</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    <Phone className="h-3.5 w-3.5 inline" /> EC
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                    <Users className="h-3.5 w-3.5 inline" /> Pickups
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Allergies</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Last Attended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(child => (
                  <tr key={child.child_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900"><a className="underline" href={`/admin/children/${child.child_id}`}>{child.name}</a></div>
                      {child.parent && (
                        <div className="text-xs text-gray-500">
                          Parent: {child.parent.first_name} {child.parent.last_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        child.safety_status === 'complete'
                          ? 'bg-green-50 text-green-700'
                          : child.safety_status === 'warning'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                      }`}>
                        {child.safety_status === 'complete' ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : child.safety_status === 'warning' ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : (
                          <ShieldAlert className="h-3 w-3" />
                        )}
                        {child.safety_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {child.issues.length === 0 ? (
                        <span className="text-xs text-gray-400">None</span>
                      ) : (
                        <div className="space-y-0.5">
                          {child.issues.map((issue, i) => (
                            <div key={i} className={`text-xs ${
                              issue.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {issue.issue}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${
                        child.emergency_contacts_count === 0 ? 'text-red-600' : 'text-gray-700'
                      }`}>
                        {child.emergency_contacts_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${
                        child.pickups_count === 0 ? 'text-red-600' : 'text-gray-700'
                      }`}>
                        {child.pickups_count}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {child.allergy_flags.length === 0 ? (
                        <span className="text-xs text-gray-400">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {child.allergy_flags.map((a, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {child.last_attendance_date || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
