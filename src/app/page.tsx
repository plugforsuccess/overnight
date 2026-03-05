import Link from 'next/link';
import { Moon, Shield, Clock, Users, Star, Calendar, Heart, BedDouble } from 'lucide-react';
import { DEFAULT_PRICING_TIERS, formatCents, OVERNIGHT_START, OVERNIGHT_END } from '@/lib/constants';

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-night-900 via-night-800 to-brand-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Moon className="h-8 w-8 text-night-300" />
              <span className="text-night-300 font-medium">Licensed FCCLH in Georgia</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Overnight Childcare for Night-Shift Parents
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Working late shifts? Need reliable overnight care? DreamWatch provides safe, licensed
              overnight childcare from {OVERNIGHT_START} to {OVERNIGHT_END}, Sunday through Thursday.
              Flexible weekly plans starting at just {formatCents(DEFAULT_PRICING_TIERS[0].price_cents)}/week.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/schedule" className="btn-primary text-lg px-8 py-3 text-center">
                Check Availability
              </Link>
              <Link href="/pricing" className="btn-secondary text-lg px-8 py-3 text-center bg-white/10 border-white/20 text-white hover:bg-white/20">
                View Pricing
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-night-600/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl" />
        </div>
      </section>

      {/* Trust Blocks */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="flex items-center gap-3 justify-center">
              <Shield className="h-8 w-8 text-night-600 flex-shrink-0" />
              <span className="font-semibold text-gray-900">Licensed FCCLH</span>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <Heart className="h-8 w-8 text-red-500 flex-shrink-0" />
              <span className="font-semibold text-gray-900">CPR Certified</span>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <BedDouble className="h-8 w-8 text-night-600 flex-shrink-0" />
              <span className="font-semibold text-gray-900">Safe Sleep Environment</span>
            </div>
            <div className="flex items-center gap-3 justify-center">
              <Users className="h-8 w-8 text-brand-600 flex-shrink-0" />
              <span className="font-semibold text-gray-900">Limited Spots (6 Max)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Parents Choose DreamWatch
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              We understand the challenges of non-traditional work schedules.
              Our overnight program is designed with your family&apos;s needs in mind.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: 'Licensed & Safe',
                description: 'Fully licensed Family Child Care Learning Home (FCCLH) in Georgia. Background-checked staff, secure facility, and strict safety protocols.',
              },
              {
                icon: Clock,
                title: 'Overnight Hours',
                description: `Care from ${OVERNIGHT_START} to ${OVERNIGHT_END}. Perfect for nurses, first responders, hospitality workers, and anyone with evening shifts.`,
              },
              {
                icon: Users,
                title: 'Small Group Size',
                description: 'Maximum 6 children per night ensures personalized attention and a calm, home-like environment for restful sleep.',
              },
              {
                icon: Calendar,
                title: 'Flexible Scheduling',
                description: 'Choose 1 to 5 nights per week. Pick which nights work for your schedule. Change your nights weekly.',
              },
              {
                icon: Star,
                title: 'Affordable Plans',
                description: `Weekly plans from ${formatCents(DEFAULT_PRICING_TIERS[0].price_cents)}/week for one night. The more nights you book, the more you save per night.`,
              },
              {
                icon: Moon,
                title: 'Bedtime Routines',
                description: 'We maintain consistent bedtime routines including storytime, quiet activities, and comfortable sleeping arrangements.',
              },
            ].map((feature) => (
              <div key={feature.title} className="card hover:shadow-md transition-shadow">
                <feature.icon className="h-10 w-10 text-night-600 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Create Account', desc: 'Sign up and add your child\'s profile with medical and emergency information.' },
              { step: '2', title: 'Choose Your Plan', desc: 'Select how many nights per week you need (1-5 nights).' },
              { step: '3', title: 'Pick Your Nights', desc: 'Choose which specific nights (Sun-Thu) for the upcoming week.' },
              { step: '4', title: 'Drop Off & Rest Easy', desc: 'Drop off at 9 PM, pick up by 7 AM. We handle the rest.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-night-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-night-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join families who trust DreamWatch for reliable overnight childcare.
            Spots are limited to 6 children per night.
          </p>
          <Link href="/signup" className="btn-primary text-lg px-10 py-4 inline-block">
            Reserve Your Spot
          </Link>
        </div>
      </section>
    </div>
  );
}
