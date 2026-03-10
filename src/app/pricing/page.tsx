import Link from 'next/link';

const tiers = [
  { name: 'Starter Nights', nights: '1-2 nights / week', price: '$95+', tone: 'bg-sky-50 border-sky-200' },
  { name: 'Core Care', nights: '3-4 nights / week', price: '$220+', tone: 'bg-emerald-50 border-emerald-200' },
  { name: 'Full Week', nights: '5 nights / week', price: '$320+', tone: 'bg-amber-50 border-amber-200' },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-semibold text-slate-900">Transparent overnight pricing</h1>
        <p className="mt-3 text-slate-600">Simple weekly tiers with clear expectations for attendance, pickup verification, and policy alignment.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tiers.map((tier) => (
          <article key={tier.name} className={`rounded-2xl border p-6 ${tier.tone}`}>
            <p className="text-sm font-semibold text-slate-600">{tier.name}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{tier.price}</p>
            <p className="mt-1 text-sm text-slate-700">{tier.nights}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>• Care timeline updates</li>
              <li>• Authorized pickup workflows</li>
              <li>• Incident communication trail</li>
            </ul>
          </article>
        ))}
      </div>
      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Need policy details before enrolling?</h2>
        <p className="mt-2 text-sm text-slate-600">Review operating nights, health/safety guidelines, and overnight program standards.</p>
        <div className="mt-4 flex gap-3">
          <Link href="/policies" className="btn-secondary">Policies</Link>
          <Link href="/signup" className="btn-primary">Start enrollment</Link>
        </div>
      </div>
    </div>
  );
}
