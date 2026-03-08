'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Moon, CheckCircle, Clock, AlertTriangle, Phone,
  UserCheck, XCircle, Users, ShieldCheck, LogOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_CAPACITY, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AdminSettings } from '@/types/database';

type AttendanceStatus = 'expected' | 'checked_in' | 'checked_out' | 'no_show' | 'cancelled';
type FilterTab = 'all' | 'expected' | 'checked-in' | 'checked-out' | 'no-show' | 'alerts';

interface AttendanceChild {
  id: string;
  reservationNightId: string;
  child: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    medical_notes: string | null;
  };
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  attendanceStatus: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateArrivalMinutes: number | null;
  pickupVerificationStatus: string | null;
  pickedUpByName: string | null;
  notes: string | null;
  allergies: { allergen: string; severity: string; custom_label?: string }[];
  emergencyContacts: { first_name: string; last_name: string; phone: string; relationship: string }[];
  authorizedPickups: { first_name: string; last_name: string; relationship: string; id_verified: boolean }[];
}

export default function TonightPage() {
  const router = useRouter();
  const [roster, setRoster] = useState<AttendanceChild[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token || ''}`,
      'Content-Type': 'application/json',
    };
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data: s } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (s) setSettings(s as AdminSettings);

      // Fetch attendance data from the tonight API
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/attendance/tonight', {
        headers: { 'Authorization': `Bearer ${session?.access_token || ''}` },
      });

      if (res.ok) {
        const { records } = await res.json();
        const items: AttendanceChild[] = (records || []).map((r: any) => ({
          id: r.id,
          reservationNightId: r.reservation_night_id,
          child: r.child || { id: r.child_id, first_name: '?', last_name: '?', date_of_birth: '', medical_notes: null },
          parent: r.parent || null,
          attendanceStatus: r.attendance_status,
          checkInTime: r.checked_in_at,
          checkOutTime: r.checked_out_at,
          lateArrivalMinutes: r.late_arrival_minutes,
          pickupVerificationStatus: r.pickup_verification_status,
          pickedUpByName: null,
          notes: r.arrival_notes || r.departure_notes || null,
          allergies: r.child?.child_allergies || [],
          emergencyContacts: r.child?.child_emergency_contacts || [],
          authorizedPickups: r.child?.child_authorized_pickups || [],
        }));
        setRoster(items);
      }

      setLoading(false);
    }
    load();
  }, [router, getAuthHeaders]);

  async function handleCheckIn(item: AttendanceChild) {
    setActionLoading(item.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/attendance/check-in', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reservationNightId: item.reservationNightId }),
      });
      if (res.ok) {
        const { record } = await res.json();
        setRoster(prev => prev.map(r =>
          r.id === item.id
            ? { ...r, attendanceStatus: 'checked_in' as AttendanceStatus, checkInTime: record.checked_in_at, lateArrivalMinutes: record.late_arrival_minutes }
            : r
        ));
      } else {
        const { error } = await res.json();
        alert(`Check-in failed: ${error}`);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCheckOut(item: AttendanceChild) {
    setActionLoading(item.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/attendance/check-out', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reservationNightId: item.reservationNightId }),
      });
      if (res.ok) {
        const { record } = await res.json();
        setRoster(prev => prev.map(r =>
          r.id === item.id
            ? { ...r, attendanceStatus: 'checked_out' as AttendanceStatus, checkOutTime: record.checked_out_at, pickedUpByName: null }
            : r
        ));
      } else {
        const { error } = await res.json();
        alert(`Check-out failed: ${error}`);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleNoShow(item: AttendanceChild) {
    setActionLoading(item.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/attendance/no-show', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reservationNightId: item.reservationNightId }),
      });
      if (res.ok) {
        setRoster(prev => prev.map(r =>
          r.id === item.id ? { ...r, attendanceStatus: 'no_show' as AttendanceStatus } : r
        ));
      } else {
        const { error } = await res.json();
        alert(`No-show failed: ${error}`);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCorrect(item: AttendanceChild, newStatus: AttendanceStatus) {
    const reason = prompt('Reason for correction:');
    if (!reason) return;

    setActionLoading(item.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/attendance/correct', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          attendanceRecordId: item.id,
          newStatus,
          reason,
        }),
      });
      if (res.ok) {
        const { record } = await res.json();
        setRoster(prev => prev.map(r =>
          r.id === item.id
            ? { ...r, attendanceStatus: record.attendance_status, checkInTime: record.check_in_time, checkOutTime: record.check_out_time }
            : r
        ));
      } else {
        const { error } = await res.json();
        alert(`Correction failed: ${error}`);
      }
    } finally {
      setActionLoading(null);
    }
  }

  const checkedInCount = roster.filter(r => r.attendanceStatus === 'checked_in').length;
  const checkedOutCount = roster.filter(r => r.attendanceStatus === 'checked_out').length;
  const noShowCount = roster.filter(r => r.attendanceStatus === 'no_show').length;
  const expectedCount = roster.filter(r => r.attendanceStatus === 'expected').length;
  const alertCount = roster.filter(r =>
    r.allergies.some(a => a.severity === 'SEVERE') || r.emergencyContacts.length === 0
  ).length;

  const filteredRoster = roster.filter(r => {
    if (activeTab === 'checked-in') return r.attendanceStatus === 'checked_in';
    if (activeTab === 'checked-out') return r.attendanceStatus === 'checked_out';
    if (activeTab === 'no-show') return r.attendanceStatus === 'no_show';
    if (activeTab === 'expected') return r.attendanceStatus === 'expected';
    if (activeTab === 'alerts') return r.allergies.some(a => a.severity === 'SEVERE') || r.emergencyContacts.length === 0;
    return true;
  });

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: roster.length },
    { key: 'expected', label: 'Expected', count: expectedCount },
    { key: 'checked-in', label: 'Checked In', count: checkedInCount },
    { key: 'checked-out', label: 'Checked Out', count: checkedOutCount },
    { key: 'no-show', label: 'No-Show', count: noShowCount },
    { key: 'alerts', label: 'Alerts', count: alertCount },
  ];

  return (
    <div className="py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Tonight&apos;s Attendance</h1>
            <p className="text-gray-500">{format(new Date(), 'EEEE, MMMM d, yyyy')} &middot; {OVERNIGHT_START} &ndash; {OVERNIGHT_END}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          <div className="card text-center">
            <Users className="h-6 w-6 text-navy-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-navy-800">{roster.length}</div>
            <div className="text-xs text-gray-500">Total tonight</div>
          </div>
          <div className="card text-center">
            <Clock className="h-6 w-6 text-amber-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-amber-600">{expectedCount}</div>
            <div className="text-xs text-gray-500">Expected</div>
          </div>
          <div className="card text-center">
            <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-green-700">{checkedInCount}</div>
            <div className="text-xs text-gray-500">Checked in</div>
          </div>
          <div className="card text-center">
            <LogOut className="h-6 w-6 text-blue-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-blue-700">{checkedOutCount}</div>
            <div className="text-xs text-gray-500">Checked out</div>
          </div>
          <div className="card text-center">
            <Moon className="h-6 w-6 text-navy-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-navy-800">{roster.length}/{capacity}</div>
            <div className="text-xs text-gray-500">Capacity</div>
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

        {/* Roster List */}
        {filteredRoster.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500">
              {activeTab === 'all' ? 'No children expected tonight.' : `No children in "${activeTab}" category.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRoster.map(item => {
              const hasSevereAllergy = item.allergies.some(a => a.severity === 'SEVERE');
              const hasNoEmergencyContacts = item.emergencyContacts.length === 0;
              const isLoading = actionLoading === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    'card border-l-4 transition-colors',
                    item.attendanceStatus === 'checked_in' ? 'border-l-green-500 bg-green-50/30' :
                    item.attendanceStatus === 'checked_out' ? 'border-l-blue-500 bg-blue-50/30' :
                    item.attendanceStatus === 'no_show' ? 'border-l-red-400 bg-red-50/30 opacity-60' :
                    hasSevereAllergy ? 'border-l-red-500' :
                    'border-l-navy-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Child name + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {item.child?.first_name} {item.child?.last_name}
                        </h3>
                        {item.attendanceStatus === 'checked_in' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                            <CheckCircle className="h-3 w-3" /> Checked in
                            {item.checkInTime && ` at ${format(new Date(item.checkInTime), 'h:mm a')}`}
                          </span>
                        )}
                        {item.attendanceStatus === 'checked_out' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                            <LogOut className="h-3 w-3" /> Checked out
                            {item.checkOutTime && ` at ${format(new Date(item.checkOutTime), 'h:mm a')}`}
                          </span>
                        )}
                        {item.attendanceStatus === 'no_show' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 border border-red-200">
                            <XCircle className="h-3 w-3" /> No-show
                          </span>
                        )}
                        {item.lateArrivalMinutes != null && item.lateArrivalMinutes > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3" /> {item.lateArrivalMinutes}min late
                          </span>
                        )}
                      </div>

                      {/* Parent info */}
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span>Parent: {item.parent?.first_name} {item.parent?.last_name}</span>
                        {item.parent?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {item.parent.phone}
                          </span>
                        )}
                      </div>

                      {/* Pickup info for checked-out children */}
                      {item.attendanceStatus === 'checked_out' && item.pickedUpByName && (
                        <div className="mt-1 text-sm text-blue-600">
                          <UserCheck className="h-3 w-3 inline mr-1" />
                          Picked up by: {item.pickedUpByName}
                          {item.pickupVerificationStatus === 'verified' && (
                            <span className="ml-1 text-green-600">(verified)</span>
                          )}
                        </div>
                      )}

                      {/* Alerts */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {item.allergies.map((a, i) => (
                          <span
                            key={i}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                              a.severity === 'SEVERE'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200',
                            )}
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {a.allergen === 'OTHER' ? (a.custom_label || 'Other') : a.allergen.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {hasNoEmergencyContacts && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
                            <AlertTriangle className="h-2.5 w-2.5" /> No emergency contacts
                          </span>
                        )}
                        {item.authorizedPickups.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            <ShieldCheck className="h-2.5 w-2.5" /> {item.authorizedPickups.length} pickup{item.authorizedPickups.length !== 1 ? 's' : ''} verified
                          </span>
                        )}
                      </div>

                      {/* Emergency contacts */}
                      {item.emergencyContacts.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">
                          <span className="font-medium text-gray-600">Emergency:</span>{' '}
                          {item.emergencyContacts.map((c, i) => (
                            <span key={i}>
                              {i > 0 && ' | '}
                              {c.first_name} {c.last_name} ({c.relationship}) {c.phone}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Authorized pickups */}
                      {item.authorizedPickups.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">
                          <span className="font-medium text-gray-600">Authorized pickups:</span>{' '}
                          {item.authorizedPickups.map((p, i) => (
                            <span key={i}>
                              {i > 0 && ', '}
                              {p.first_name} {p.last_name} ({p.relationship})
                              {p.id_verified && ' \u2713'}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {item.notes && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                          <span className="font-medium">Notes:</span> {item.notes}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {item.attendanceStatus === 'expected' && (
                        <>
                          <button
                            onClick={() => handleCheckIn(item)}
                            disabled={isLoading}
                            className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" /> Check In
                          </button>
                          <button
                            onClick={() => handleNoShow(item)}
                            disabled={isLoading}
                            className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" /> No-Show
                          </button>
                        </>
                      )}
                      {item.attendanceStatus === 'checked_in' && (
                        <>
                          <button
                            onClick={() => handleCheckOut(item)}
                            disabled={isLoading}
                            className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                          >
                            <LogOut className="h-4 w-4" /> Check Out
                          </button>
                          <button
                            onClick={() => handleCorrect(item, 'expected')}
                            disabled={isLoading}
                            className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50"
                          >
                            Undo Check-In
                          </button>
                        </>
                      )}
                      {item.attendanceStatus === 'no_show' && (
                        <button
                          onClick={() => handleCorrect(item, 'expected')}
                          disabled={isLoading}
                          className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50"
                        >
                          Undo No-Show
                        </button>
                      )}
                      {item.attendanceStatus === 'checked_out' && (
                        <button
                          onClick={() => handleCorrect(item, 'checked_in')}
                          disabled={isLoading}
                          className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-50"
                        >
                          Undo Check-Out
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
