'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { DAY_LABELS } from '@/lib/constants';
import { AdminSettings, DayOfWeek } from '@/types/database';

const ALL_DAYS: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }

      const { data } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (data) setSettings(data as AdminSettings);
      setLoading(false);
    }
    load();
  }, [router]);

  function toggleNight(day: DayOfWeek) {
    if (!settings) return;
    const nights = [...settings.operating_nights];
    const idx = nights.indexOf(day);
    if (idx >= 0) {
      nights.splice(idx, 1);
    } else {
      nights.push(day);
    }
    setSettings({ ...settings, operating_nights: nights });
  }

  function updateTier(index: number, priceCents: number) {
    if (!settings) return;
    const tiers = [...settings.pricing_tiers];
    tiers[index] = { ...tiers[index], price_cents: priceCents };
    setSettings({ ...settings, pricing_tiers: tiers });
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from('admin_settings')
      .update({
        max_capacity: settings.max_capacity,
        operating_nights: settings.operating_nights,
        pricing_tiers: settings.pricing_tiers,
        billing_day: settings.billing_day,
        billing_time: settings.billing_time,
        waitlist_confirm_hours: settings.waitlist_confirm_hours,
        overnight_start_time: settings.overnight_start_time,
        overnight_end_time: settings.overnight_end_time,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id);

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (loading || !settings) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-3xl font-bold text-gray-900">Program Settings</h1>
        </div>

        <div className="space-y-8">
          {/* Capacity */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Capacity</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Children Per Night</label>
              <input
                type="number"
                min={1}
                max={12}
                value={settings.max_capacity}
                onChange={e => setSettings({ ...settings, max_capacity: parseInt(e.target.value) || 6 })}
                className="input-field w-32"
              />
            </div>
          </div>

          {/* Operating Nights */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Operating Nights</h2>
            <div className="flex flex-wrap gap-3">
              {ALL_DAYS.map(day => (
                <button
                  key={day}
                  onClick={() => toggleNight(day)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    settings.operating_nights.includes(day)
                      ? 'bg-night-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Tiers */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Pricing Tiers (Weekly)</h2>
            <div className="space-y-3">
              {settings.pricing_tiers.map((tier, i) => (
                <div key={tier.nights} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700 w-32">
                    {tier.nights} Night{tier.nights > 1 ? 's' : ''}/Week
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={tier.price_cents / 100}
                      onChange={e => updateTier(i, Math.round(parseFloat(e.target.value) * 100))}
                      className="input-field w-28"
                    />
                  </div>
                  <span className="text-sm text-gray-500">
                    (${(tier.price_cents / 100 / tier.nights).toFixed(2)}/night)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Billing */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Billing</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Day</label>
                <select
                  value={settings.billing_day}
                  onChange={e => setSettings({ ...settings, billing_day: e.target.value })}
                  className="input-field"
                >
                  {ALL_DAYS.map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Time</label>
                <input
                  type="time"
                  value={settings.billing_time}
                  onChange={e => setSettings({ ...settings, billing_time: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Waitlist */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Waitlist</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Window (hours)</label>
              <input
                type="number"
                min={1}
                max={72}
                value={settings.waitlist_confirm_hours}
                onChange={e => setSettings({ ...settings, waitlist_confirm_hours: parseInt(e.target.value) || 24 })}
                className="input-field w-32"
              />
              <p className="text-sm text-gray-500 mt-1">
                Hours a parent has to confirm after being offered a waitlist spot.
              </p>
            </div>
          </div>

          {/* Overnight Hours */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Overnight Hours</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={settings.overnight_start_time}
                  onChange={e => setSettings({ ...settings, overnight_start_time: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={settings.overnight_end_time}
                  onChange={e => setSettings({ ...settings, overnight_end_time: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-4">
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            {saved && <span className="text-green-600 font-medium">Settings saved successfully!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
