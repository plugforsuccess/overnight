export const metadata = {
  title: 'Policies & FAQ | DreamWatch Overnight',
};

export default function PoliciesPage() {
  const faqs = [
    {
      q: 'What ages do you accept?',
      a: 'We accept children ages 6 weeks through 12 years old, in accordance with Georgia FCCLH licensing requirements.',
    },
    {
      q: 'What are your hours?',
      a: 'Overnight care runs from 9:00 PM to 7:00 AM, Sunday through Thursday nights. Drop-off begins at 8:45 PM and pickup must be completed by 7:15 AM.',
    },
    {
      q: 'How many children do you care for?',
      a: 'We are licensed for a maximum of 6 children per night, ensuring personalized attention and a calm environment.',
    },
    {
      q: 'What should my child bring?',
      a: 'Please bring: comfortable pajamas, a change of clothes, any comfort items (blanket, stuffed animal), diapers/pull-ups if needed, and any required medications with written instructions.',
    },
    {
      q: 'What is your sick policy?',
      a: 'Children with fever (100.4°F or higher), vomiting, diarrhea, or contagious illness within the last 24 hours cannot attend. If a child becomes ill during care, parents will be contacted immediately for pickup.',
    },
    {
      q: 'How does billing work?',
      a: 'We bill weekly in advance. Payment is charged every Friday at 12:00 PM for the upcoming week (Sunday–Thursday). You select your specific nights each week. Plans can be paused or cancelled for the next billing cycle.',
    },
    {
      q: 'What if the night I want is full?',
      a: 'If a night has reached capacity (6 children), you can join the waitlist. You\'ll be notified if a spot opens up and will have 24 hours to confirm.',
    },
    {
      q: 'Can I change my nights week to week?',
      a: 'Yes! Your plan determines how many nights per week you get. You choose which specific nights before the weekly billing cutoff. You can pick different nights each week.',
    },
    {
      q: 'What is your cancellation policy?',
      a: 'You may cancel or pause your plan at any time. Changes take effect the next billing cycle. We do not offer refunds for the current paid week, but you may reschedule nights within the same week if space is available.',
    },
    {
      q: 'Who can pick up my child?',
      a: 'Only individuals listed as authorized pickup contacts on your child\'s profile may pick up. Valid photo ID is required. Please update your authorized pickup list in your dashboard as needed.',
    },
  ];

  return (
    <div className="py-16 md:py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Policies & FAQ</h1>
        <p className="text-gray-600 text-lg mb-12">
          Everything you need to know about DreamWatch Overnight childcare.
        </p>

        {/* Policies */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Program Policies</h2>

          <div className="space-y-6">
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Drop-off & Pickup</h3>
              <p className="text-gray-600">
                Drop-off window: 8:45 PM – 9:15 PM. Late drop-offs after 9:15 PM may not be accepted.
                Pickup window: 6:45 AM – 7:15 AM. Late pickup after 7:15 AM incurs a $5/minute fee.
                Only authorized individuals with valid photo ID may pick up children.
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Health & Safety</h3>
              <p className="text-gray-600">
                All children must have a completed health profile including allergies, medical conditions,
                and emergency contacts. We follow Georgia FCCLH health and safety regulations.
                Our facility maintains appropriate staff-to-child ratios, fire safety equipment,
                and secure entry/exit protocols.
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Medications</h3>
              <p className="text-gray-600">
                If your child requires medication during overnight hours, please provide written instructions
                with dosage, timing, and the medication in its original container. Over-the-counter
                medication will not be administered without parent authorization.
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Emergency Procedures</h3>
              <p className="text-gray-600">
                In case of emergency, we will call 911 first, then contact parents immediately.
                All staff are trained in pediatric first aid and CPR. Emergency contact information
                must be kept current in your parent dashboard.
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-2">Payment & Cancellation</h3>
              <p className="text-gray-600">
                Weekly billing in advance via Stripe. Plans may be cancelled at any time with changes
                effective the next billing cycle. No refunds for the current paid week.
                Repeated no-shows (3 consecutive weeks) may result in plan cancellation.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="card">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-gray-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
