'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Moon, CheckCircle, Clock, AlertTriangle, Phone,
  UserCheck, XCircle, Users, ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DEFAULT_CAPACITY, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { AdminSettings, Child, OvernightBlock, Profile } from '@/types/database';

interface RosterChild {
  reservationId: string;
  child: Child;
  parent: Profile | null;
  status: string;
  allergies: { allergen: string; severity: string; custom_label?: string }[];
  emergencyContacts: { first_name: string; last_name: string; phone: string; relationship: string }[];
  authorizedPickups: { first_name: string; last_name: string; relationship: string; id_verified: boolean }[];
  checkedIn: boolean;
  caregiverNotes: string;
}

type FilterTab = 'all' | 'expected' | 'checked-in' | 'no-show' | 'alerts';

export default function TonightPage() {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterChild[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [noShows, setNoShows] = useState<Set<string>>(new Set());

  const today = format(new Date(), 'yyyy-MM-dd');
  const capacity = settings?.max_capacity ?? DEFAULT_CAPACITY;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data: s } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (s) setSettings(s as AdminSettings);

      // Fetch tonight's confirmed reservations with child details
      const { data: reservations } = await supabase
        .from('reservations')
        .select(`
          id, date, status,
          child:children(
            id, first_name, last_name, date_of_birth, medical_notes,
            child_allergies(allergen, severity, custom_label),
            child_emergency_contacts(first_name, last_name, phone, relationship),
            child_authorized_pickups(first_name, last_name, relationship, id_verified)
          ),
          overnight_block:overnight_blocks(
            id, caregiver_notes,
            parent:parents(id, first_name, last_name, email, phone)
          )
        `)
        .eq('date', today)
        .in('status', ['confirmed', 'locked']);

      const items: RosterChild[] = (reservations || []).map((r: any) => {
        const child = r.child;
        const block = r.overnight_block;
        const parent = block?.parent || null;
        return {
          reservationId: r.id,
          child: child,
          parent: parent,
          status: r.status,
          allergies: child?.child_allergies || [],
          emergencyContacts: child?.child_emergency_contacts || [],
          authorizedPickups: child?.child_authorized_pickups || [],
          checkedIn: false,
          caregiverNotes: block?.caregiver_notes || '',
        };
      });

      setRoster(items);
      setLoading(false);
    }
    load();
  }, [router, today]);

  function handleCheckIn(reservationId: string) {
    setCheckedIn((prev: Set<string>) => new Set(prev).add(reservationId));
    setNoShows((prev: Set<string>) => {
      const next = new Set(prev);
      next.delete(reservationId);
      return next;
    });
  }

  function handleNoShow(reservationId: string) {
    setNoShows((prev: Set<string>) => new Set(prev).add(reservationId));
    setCheckedIn((prev: Set<string>) => {
      const next = new Set(prev);
      next.delete(reservationId);
      return next;
    });
  }

  const checkedInCount = checkedIn.size;
  const noShowCount = noShows.size;
  const expectedCount = roster.length - checkedInCount - noShowCount;
  const alertCount = roster.filter(r =>
    r.allergies.some(a => a.severity === 'SEVERE') || r.emergencyContacts.length === 0
  ).length;

  const filteredRoster = roster.filter(r => {
    if (activeTab === 'checked-in') return checkedIn.has(r.reservationId);
    if (activeTab === 'no-show') return noShows.has(r.reservationId);
    if (activeTab === 'expected') return !checkedIn.has(r.reservationId) && !noShows.has(r.reservationId);
    if (activeTab === 'alerts') return r.allergies.some(a => a.severity === 'SEVERE') || r.emergencyContacts.length === 0;
    return true;
  });

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: roster.length },
    { key: 'expected', label: 'Expected', count: expectedCount },
    { key: 'checked-in', label: 'Checked In', count: checkedInCount },
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <Users className="h-6 w-6 text-navy-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-navy-800">{roster.length}</div>
            <div className="text-xs text-gray-500">Expected tonight</div>
          </div>
          <div className="card text-center">
            <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
            <div className="text-2xl font-bold text-green-700">{checkedInCount}</div>
            <div className="text-xs text-gray-500">Checked in</div>
          </div>
          <div className="card text-center">
            <XCircle className="h-6 w-6 text-red-500 mx-auto mb-1" />
            <div className="text-2xl font-bold text-red-600">{noShowCount}</div>
            <div className="text-xs text-gray-500">No-shows</div>
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
              const isCheckedIn = checkedIn.has(item.reservationId);
              const isNoShow = noShows.has(item.reservationId);
              const hasSevereAllergy = item.allergies.some(a => a.severity === 'SEVERE');
              const hasNoEmergencyContacts = item.emergencyContacts.length === 0;

              return (
                <div
                  key={item.reservationId}
                  className={cn(
                    'card border-l-4 transition-colors',
                    isCheckedIn ? 'border-l-green-500 bg-green-50/30' :
                    isNoShow ? 'border-l-red-400 bg-red-50/30 opacity-60' :
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
                        {isCheckedIn && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                            <CheckCircle className="h-3 w-3" /> Checked in
                          </span>
                        )}
                        {isNoShow && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 border border-red-200">
                            <XCircle className="h-3 w-3" /> No-show
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

                      {/* Caregiver notes */}
                      {item.caregiverNotes && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                          <span className="font-medium">Caregiver notes:</span> {item.caregiverNotes}
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
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {!isCheckedIn && !isNoShow && (
                        <>
                          <button
                            onClick={() => handleCheckIn(item.reservationId)}
                            className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1.5"
                          >
                            <CheckCircle className="h-4 w-4" /> Check In
                          </button>
                          <button
                            onClick={() => handleNoShow(item.reservationId)}
                            className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4" /> No-Show
                          </button>
                        </>
                      )}
                      {isCheckedIn && (
                        <button
                          onClick={() => setCheckedIn((prev: Set<string>) => { const s = new Set(prev); s.delete(item.reservationId); return s; })}
                          className="btn-secondary text-sm px-3 py-1.5"
                        >
                          Undo
                        </button>
                      )}
                      {isNoShow && (
                        <button
                          onClick={() => setNoShows((prev: Set<string>) => { const s = new Set(prev); s.delete(item.reservationId); return s; })}
                          className="btn-secondary text-sm px-3 py-1.5"
                        >
                          Undo
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
