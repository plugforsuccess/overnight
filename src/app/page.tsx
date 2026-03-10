import Link from 'next/link';
import { Shield, Clock3, CheckCircle2, CalendarDays, FileCheck2 } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="bg-slate-50">
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="mb-3 inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Premium overnight childcare platform</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">Trusted overnight care, designed for working families.</h1>
          <p className="mt-4 text-slate-600">Book nights in minutes, monitor child activity in a calm timeline, and get verified pickup confidence from check-in to check-out.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/schedule" className="btn-primary">Book overnight care</Link>
            <Link href="/pricing" className="btn-secondary">Compare plans</Link>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">How it works</h2>
          <ol className="mt-4 space-y-4 text-sm">
            {['Select child + nights', 'Review safety and profile readiness', 'Get care timeline updates overnight', 'Verify pickup with secure authorization'].map((step, idx) => (
              <li key={step} className="flex items-start gap-3"><span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">{idx + 1}</span><span className="text-slate-700">{step}</span></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-12">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 md:grid-cols-4">
          {[
            [Shield, 'Compliance timelines', 'Incident and care events aligned for audits'],
            [Clock3, 'Operational visibility', 'Live status for arrivals, in-care, and pickup queues'],
            [FileCheck2, 'Verification-first', 'Authorized pickup and document checks built in'],
            [CalendarDays, 'Family flexibility', 'Schedule by week with clear reservation status'],
          ].map(([Icon, title, copy]) => (
            <div key={title as string} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Icon className="h-5 w-5 text-sky-600" />
              <p className="mt-2 font-semibold text-slate-900">{title as string}</p>
              <p className="mt-1 text-sm text-slate-600">{copy as string}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="rounded-3xl bg-slate-900 p-8 text-white">
          <p className="text-sm text-slate-300">Safety + trust</p>
          <h2 className="mt-2 text-3xl font-semibold">Built for child safety, parent reassurance, and staff execution.</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-lg bg-white px-4 py-2 font-semibold text-slate-900">Create account</Link>
            <Link href="/policies" className="rounded-lg border border-slate-500 px-4 py-2 font-semibold text-white">Review policies</Link>
            <Link href="/login" className="rounded-lg border border-slate-500 px-4 py-2 font-semibold text-white">Parent login</Link>
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Facility-first controls and compliance traces retained.</p>
        </div>
      </section>
    </div>
  );
}
