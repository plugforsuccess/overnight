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

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const { planId } = body;
  if (!planId || typeof planId !== 'string') {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 });
  }

  // Look up the plan to get the canonical price — never trust client-provided prices
  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, price_cents, parent_id')
    .eq('id', planId)
    .single();

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  // Resolve parent to verify ownership
  const { data: parentRow } = await supabaseAdmin
    .from('parents')
    .select('id, email, first_name, last_name, stripe_customer_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!parentRow) return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 });
  if (plan.parent_id !== parentRow.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Get or create Stripe customer
  const customerId = await getOrCreateCustomer(
    parentRow.email,
    `${parentRow.first_name} ${parentRow.last_name}`.trim(),
    parentRow.stripe_customer_id
  );

  // Update parent with Stripe customer ID
  if (!parentRow.stripe_customer_id) {
    await supabaseAdmin
      .from('parents')
      .update({ stripe_customer_id: customerId })
      .eq('id', parentRow.id);
  }

  // Create a Checkout Session using server-verified price
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: plan.price_cents,
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
      parent_id: parentRow.id,
    },
    success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/schedule`,
  });

  return NextResponse.json({ url: session.url });
}
