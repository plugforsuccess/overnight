import { NextRequest, NextResponse } from 'next/server';
import { stripe, getOrCreateCustomer } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

function getUserClient(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { planId, priceCents } = await req.json();

  // Get user profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Get or create Stripe customer
  const customerId = await getOrCreateCustomer(
    profile.email,
    `${profile.first_name} ${profile.last_name}`.trim(),
    profile.stripe_customer_id
  );

  // Update profile with Stripe customer ID
  if (!profile.stripe_customer_id) {
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  // Create a Checkout Session for weekly subscription
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: priceCents,
          recurring: { interval: 'week', interval_count: 1 },
          product_data: {
            name: 'DreamWatch Overnight - Weekly Plan',
            description: 'Weekly overnight childcare subscription',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      plan_id: planId,
      user_id: user.id,
    },
    success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/schedule`,
  });

  return NextResponse.json({ url: session.url });
}
