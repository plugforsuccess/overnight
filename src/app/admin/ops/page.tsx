'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
  ArrowLeft,
  RefreshCw,
  ClipboardCheck,
  BarChart3,
  Users,
  ShieldCheck,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';

interface OpsMetrics {
  attendance_integrity: number;
  capacity_utilization: number;
  waitlist_pressure: number;
  safety_completeness: number;
  revenue_capture: number;
}

interface MetricCard {
  key: keyof OpsMetrics;
  label: string;
  icon: React.ElementType;
  getColor: (value: number) => 'green' | 'yellow' | 'red';
  description: string;
}

// Thresholds per spec:
//   Attendance Integrity: green >= 98%, yellow >= 95%, red < 95%
//   Capacity Utilization: green 40-95%, yellow <40% or >95%
//   Waitlist Pressure:    green < 30%, yellow 30-50%, red > 50%
//   Safety Completeness:  green 100%, yellow >= 90%, red < 90%
//   Revenue Capture:      green >= 95%, yellow >= 85%, red < 85%
const METRIC_CARDS: MetricCard[] = [
  {
    key: 'attendance_integrity',
    label: 'Attendance Integrity',
    icon: ClipboardCheck,
    getColor: (v) => v >= 0.98 ? 'green' : v >= 0.95 ? 'yellow' : 'red',
    description: 'Reservations matching attendance records',
  },
  {
    key: 'capacity_utilization',
    label: 'Capacity Utilization',
    icon: BarChart3,
    getColor: (v) => (v >= 0.40 && v <= 0.95) ? 'green' : 'yellow',
    description: 'Proportion of capacity currently reserved',
  },
  {
    key: 'waitlist_pressure',
    label: 'Waitlist Pressure',
    icon: Users,
    getColor: (v) => v <= 0.30 ? 'green' : v <= 0.50 ? 'yellow' : 'red',
    description: 'Families waiting relative to total capacity',
  },
  {
    key: 'safety_completeness',
    label: 'Safety Completeness',
    icon: ShieldCheck,
    getColor: (v) => v >= 1.0 ? 'green' : v >= 0.90 ? 'yellow' : 'red',
    description: 'Child profiles with complete safety info',
  },
  {
    key: 'revenue_capture',
    label: 'Revenue Capture',
    icon: DollarSign,
    getColor: (v) => v >= 0.95 ? 'green' : v >= 0.85 ? 'yellow' : 'red',
    description: 'Booked nights that have been paid',
  },
];

const COLOR_CLASSES = {
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: 'text-green-600',
    badge: 'bg-green-100 text-green-800',
    label: 'Healthy',
  },
  yellow: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    icon: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-800',
    label: 'Warning',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: 'text-red-600',
    badge: 'bg-red-100 text-red-800',
    label: 'Critical',
  },
};

export default function OpsHealthDashboard() {
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch('/api/admin/ops-metrics', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setMetrics(await res.json());
    }
    setLoading(false);
  };

  useEffect(() => { fetchMetrics(); }, []);

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
              <h1 className="text-2xl font-bold text-gray-900">Operations Health</h1>
              <p className="text-sm text-gray-500">Key operational metrics for today</p>
            </div>
          </div>
          <button onClick={fetchMetrics} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="card p-8 text-center text-gray-500">Loading operations metrics...</div>
        ) : !metrics ? (
          <div className="card p-8 text-center text-gray-500">Failed to load operations metrics.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {METRIC_CARDS.map((card) => {
              const value = metrics[card.key];
              const status = card.getColor(value);
              const colors = COLOR_CLASSES[status];
              const Icon = card.icon;
              const pct = (value * 100).toFixed(1);

              return (
                <div
                  key={card.key}
                  className={`card p-5 border ${colors.border} ${colors.bg}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${colors.bg}`}>
                        <Icon className={`h-5 w-5 ${colors.icon}`} />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-700">{card.label}</h3>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                      {colors.label}
                    </span>
                  </div>
                  <p className={`text-3xl font-bold ${colors.text} mb-1`}>{pct}%</p>
                  <p className="text-xs text-gray-500">{card.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
