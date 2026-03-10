'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { DAY_LABELS } from '@/lib/constants';
import { AdminSettings, DayOfWeek } from '@/types/database';
import { ActionBar, InfoList, PageHeader, SectionCard } from '@/components/ui/system';

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
      const { data: profile } = await supabase.from('parents').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/dashboard'); return; }
      const { data } = await supabase.from('admin_settings').select('*').limit(1).single();
      if (data) setSettings(data as AdminSettings);
      setLoading(false);
    }
    load();
  }, [router]);

  function toggleNight(day: DayOfWeek) {
    if (!settings) return;
    const nights = settings.operating_nights.includes(day) ? settings.operating_nights.filter((n) => n !== day) : [...settings.operating_nights, day];
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
    const { error } = await supabase.from('admin_settings').update({
      max_capacity: settings.max_capacity,
      operating_nights: settings.operating_nights,
      pricing_tiers: settings.pricing_tiers,
      billing_day: settings.billing_day,
      billing_time: settings.billing_time,
      waitlist_confirm_hours: settings.waitlist_confirm_hours,
      overnight_start_time: settings.overnight_start_time,
      overnight_end_time: settings.overnight_end_time,
      updated_at: new Date().toISOString(),
    }).eq('id', settings.id);
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  }

  if (loading || !settings) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader title="Facility Settings" subtitle="Operating hours, capacity rules, pricing, and billing controls" />

      <SectionCard title="Facility Settings">
        <InfoList items={[{ label: 'Max Capacity', value: settings.max_capacity }, { label: 'Billing Day', value: DAY_LABELS[settings.billing_day as DayOfWeek] }, { label: 'Billing Time', value: settings.billing_time }]} />
      </SectionCard>

      <SectionCard title="Operating Hours">
        <div className="grid gap-4 sm:grid-cols-2">
          <input type="time" value={settings.overnight_start_time} onChange={(e) => setSettings({ ...settings, overnight_start_time: e.target.value })} className="input-field" />
          <input type="time" value={settings.overnight_end_time} onChange={(e) => setSettings({ ...settings, overnight_end_time: e.target.value })} className="input-field" />
        </div>
      </SectionCard>

      <SectionCard title="Capacity Rules">
        <div className="space-y-3">
          <input type="number" min={1} max={12} value={settings.max_capacity} onChange={(e) => setSettings({ ...settings, max_capacity: parseInt(e.target.value) || 6 })} className="input-field w-40" />
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((day) => <button key={day} onClick={() => toggleNight(day)} className={`rounded-lg px-3 py-1.5 text-sm ${settings.operating_nights.includes(day) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{DAY_LABELS[day]}</button>)}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Pricing">
        <div className="space-y-3">
          {settings.pricing_tiers.map((tier, i) => (
            <div key={tier.nights} className="flex items-center gap-3">
              <span className="w-32 text-sm text-slate-600">{tier.nights} night/week</span>
              <input type="number" min={0} step={5} value={tier.price_cents / 100} onChange={(e) => updateTier(i, Math.round(parseFloat(e.target.value) * 100))} className="input-field w-32" />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Billing">
        <div className="grid gap-4 sm:grid-cols-2">
          <select value={settings.billing_day} onChange={(e) => setSettings({ ...settings, billing_day: e.target.value })} className="input-field">{ALL_DAYS.map((d) => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}</select>
          <input type="time" value={settings.billing_time} onChange={(e) => setSettings({ ...settings, billing_time: e.target.value })} className="input-field" />
        </div>
      </SectionCard>

      <ActionBar>
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">{saving ? 'Saving...' : 'Save settings'}</button>
        {saved && <span className="ml-3 text-sm text-emerald-700">Settings saved successfully.</span>}
      </ActionBar>
    </div>
  );
}
