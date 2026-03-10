const sections = [
  { id: 'care-hours', title: 'Care Hours', copy: 'Overnight care runs on approved nights with structured check-in, quiet transition, and morning checkout windows.' },
  { id: 'pickup', title: 'Pickup Verification', copy: 'All pickups require authorized adult records and verification before handoff is completed.' },
  { id: 'health', title: 'Health + Safety', copy: 'Medication/allergy details and emergency contacts are required to maintain safe overnight care.' },
  { id: 'incidents', title: 'Incidents + Communication', copy: 'Families receive clear incident notifications and acknowledgement options with a documented timeline.' },
];

export default function PoliciesPage() {
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 md:grid-cols-[240px,1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 h-fit md:sticky md:top-20">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jump to section</p>
        <nav className="mt-3 space-y-1 text-sm">
          {sections.map((section) => <a key={section.id} href={`#${section.id}`} className="block rounded px-2 py-1 text-slate-700 hover:bg-slate-100">{section.title}</a>)}
        </nav>
      </aside>
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold text-slate-900">Program policies</h1>
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
            <p className="mt-2 text-slate-600">{section.copy}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
