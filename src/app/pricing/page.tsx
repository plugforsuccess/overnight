import Link from 'next/link';
import { Check } from 'lucide-react';
import { DEFAULT_PRICING_TIERS, formatCents, pricePerNight, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';

export const metadata = {
  title: 'Pricing | DreamWatch Overnight',
  description: 'Affordable weekly overnight childcare plans. Starting at $95/week for 1 night.',
};

export default function PricingPage() {
  const tiers = DEFAULT_PRICING_TIERS;
  const bestValue = 3; // 3-night plan index

  return (
    <div className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Weekly plans reserve your spot&mdash;paid weekly in advance. The more nights you book, the more you save.
            All plans include overnight care from {OVERNIGHT_START} to {OVERNIGHT_END}.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 mb-16">
          {tiers.map((tier, i) => {
            const perNight = pricePerNight(tier);
            const isBest = tier.nights === bestValue;
            return (
              <div
                key={tier.nights}
                className={`card relative ${isBest ? 'border-night-600 border-2 shadow-lg scale-105' : ''}`}
              >
                {isBest && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-night-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    Best Value
                  </div>
                )}
                <div className="text-center">
                  <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">
                    {tier.nights} Night{tier.nights > 1 ? 's' : ''} / Week
                  </div>
                  <div className="text-4xl font-bold text-gray-900 mb-1">
                    {formatCents(tier.price_cents)}
                  </div>
                  <div className="text-sm text-gray-500 mb-4">
                    per week ({formatCents(perNight)}/night)
                  </div>
                  {i > 0 && (
                    <div className="text-xs text-green-600 font-medium mb-4">
                      Save {formatCents(tiers[0].price_cents * tier.nights - tier.price_cents)} vs single-night rate
                    </div>
                  )}
                  <Link href="/signup" className={`w-full block text-center py-2.5 px-4 rounded-lg font-semibold transition-colors ${isBest ? 'bg-night-600 hover:bg-night-700 text-white' : 'btn-secondary'}`}>
                    Get Started
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* What's Included */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Every Plan Includes
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              'Licensed FCCLH facility',
              'Background-checked caregivers',
              'Small group size (max 6 children)',
              'Bedtime routine & storytime',
              'Comfortable sleeping arrangements',
              'Snack provided',
              'Online parent dashboard',
              'Flexible night selection each week',
              'Emergency contact protocols',
              'Weekly billing (no long-term contracts)',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span className="text-gray-700">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Billing Info */}
        <div className="mt-16 card max-w-3xl mx-auto">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Billing Details</h3>
          <ul className="space-y-2 text-gray-600">
            <li>&#8226; Payment is charged weekly in advance (default: Friday at 12:00 PM for the upcoming week).</li>
            <li>&#8226; You select your specific nights each week before the billing cutoff.</li>
            <li>&#8226; Plans can be paused or cancelled at any time, effective the next billing cycle.</li>
            <li>&#8226; Payments are processed securely through Stripe.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
