'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, Menu, X } from 'lucide-react';

export type StatusTone = 'green' | 'yellow' | 'red' | 'blue' | 'gray';

const toneMap: Record<StatusTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
  gray: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function StatusBadge({ tone = 'gray', children }: { tone?: StatusTone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneMap[tone]}`}>{children}</span>;
}

export function SectionCard({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({ label, value, tone = 'gray' }: { label: string; value: string | number; tone?: StatusTone }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <div className="mt-2"><StatusBadge tone={tone}>{tone}</StatusBadge></div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function AlertCard({ tone = 'yellow', title, children }: { tone?: StatusTone; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" />{title}</div>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
}

export function Timeline({ children }: { children: React.ReactNode }) {
  return <ol className="space-y-3">{children}</ol>;
}

export function TimelineItem({ title, time, tone = 'blue', description }: { title: string; time?: string; tone?: StatusTone; description?: string }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${tone === 'green' ? 'bg-emerald-500' : tone === 'yellow' ? 'bg-amber-500' : tone === 'red' ? 'bg-rose-500' : tone === 'blue' ? 'bg-sky-500' : 'bg-slate-400'}`} />
      <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {time && <span className="text-xs text-slate-500">{time}</span>}
        </div>
        {description && <p className="mt-1 text-xs text-slate-600">{description}</p>}
      </div>
    </li>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ChildCard({ name, details, status }: { name: string; details: React.ReactNode; status?: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h4 className="font-semibold text-slate-900">{name}</h4>{status}</div><div className="mt-2 text-sm text-slate-600">{details}</div></div>;
}

export function InfoList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return <dl className="space-y-2">{items.map((item) => <div key={item.label} className="flex justify-between gap-4 text-sm"><dt className="text-slate-500">{item.label}</dt><dd className="text-right font-medium text-slate-900">{item.value}</dd></div>)}</dl>;
}

export function ActionBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-4 z-20 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">{children}</div>;
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">{children}</div>;
}

export function TaskRow({ title, status, meta, actions }: { title: string; status: React.ReactNode; meta?: string; actions?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"><div><p className="font-medium text-slate-900">{title}</p>{meta && <p className="text-xs text-slate-500">{meta}</p>}</div><div className="flex items-center gap-2">{status}{actions}</div></div>;
}

export function IncidentPanel({ summary, status, childName }: { summary: string; status: React.ReactNode; childName?: string }) {
  return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><div className="flex items-center justify-between"><p className="font-semibold text-rose-900">Incident Case</p>{status}</div>{childName && <p className="mt-1 text-sm text-rose-700">Child: {childName}</p>}<p className="mt-2 text-sm text-rose-800">{summary}</p></div>;
}

export function PickupVerificationCard({ name, status, note }: { name: string; status: React.ReactNode; note?: string }) { return <SectionCard title={name} subtitle={note}><div>{status}</div></SectionCard>; }
export function ReservationStatusCard({ title, children }: { title: string; children: React.ReactNode }) { return <SectionCard title={title}>{children}</SectionCard>; }
export function DocumentStatusCard({ title, children }: { title: string; children: React.ReactNode }) { return <SectionCard title={title}>{children}</SectionCard>; }

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30">
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button onClick={onClose}><X className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function MobileBottomActions({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] md:hidden">{children}</div>;
}

export function SidebarNav({ title, items }: { title: string; items: { href: string; label: string }[] }) {
  return <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 lg:block"><p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><nav className="space-y-1">{items.map((item) => <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">{item.label}</Link>)}</nav></aside>;
}

export function TopBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Menu className="h-4 w-4 text-slate-400" /><span className="text-sm font-semibold text-slate-700">{title}</span></div>{right}</div></header>;
}

export function AppShell({ sidebar, topbarTitle, children }: { sidebar?: React.ReactNode; topbarTitle: string; children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50"><div className="flex min-h-screen">{sidebar}<div className="min-w-0 flex-1"><TopBar title={topbarTitle} right={<StatusBadge tone="green"><CheckCircle2 className="mr-1 h-3 w-3" />Live</StatusBadge>} /><main className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main></div></div></div>;
}
