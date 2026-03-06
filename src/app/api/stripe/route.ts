import { NextRequest, NextResponse } from 'next/server';
import { stripe, getOrCreateCustomer } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';

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
  const rateLimited = rateLimit(req, { windowMs: 60_000, max: 10 });
  if (rateLimited) return rateLimited;

  const supabase = getUserClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[stripe] auth failed: no user');
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_PLAN_SELECTION' }, { status: 400 });
  }

  const { planId } = body;
  if (!planId || typeof planId !== 'string') {
    return NextResponse.json({ error: 'planId is required', code: 'INVALID_PLAN_SELECTION' }, { status: 400 });
  }

  console.log(`[stripe] checkout request: userId=${user.id} planId=${planId}`);

  // Look up the overnight_block (per-user booking) to get the canonical price
  const { data: block, error: blockError } = await supabaseAdmin
    .from('overnight_blocks')
    .select('id, weekly_price_cents, parent_id, nights_per_week, status')
    .eq('id', planId)
    .single();

  if (!block || blockError) {
    console.error(`[stripe] overnight_block not found: planId=${planId}`, blockError);
    return NextResponse.json({ error: 'Booking not found', code: 'INVALID_PLAN_SELECTION' }, { status: 404 });
  }

  console.log(`[stripe] block found: id=${block.id} price=${block.weekly_price_cents} parentId=${block.parent_id}`);

  // Resolve parent to verify ownership
  const { data: parentRow } = await supabaseAdmin
    .from('parents')
    .select('id, email, first_name, last_name, stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (!parentRow) {
    console.error(`[stripe] parent not found: userId=${user.id}`);
    return NextResponse.json({ error: 'Parent profile not found', code: 'AUTH_REQUIRED' }, { status: 404 });
  }

  if (block.parent_id !== parentRow.id) {
    console.error(`[stripe] ownership mismatch: block.parent_id=${block.parent_id} parentRow.id=${parentRow.id}`);
    return NextResponse.json({ error: 'Unauthorized', code: 'CHILD_NOT_OWNED' }, { status: 403 });
  }

  // Get or create Stripe customer
  let customerId: string;
  try {
    customerId = await getOrCreateCustomer(
      parentRow.email,
      `${parentRow.first_name} ${parentRow.last_name}`.trim(),
      parentRow.stripe_customer_id
    );
    console.log(`[stripe] customer: id=${customerId} existing=${!!parentRow.stripe_customer_id}`);
  } catch (err) {
    console.error('[stripe] customer create failed:', err);
    return NextResponse.json({ error: 'Failed to set up payment', code: 'STRIPE_CUSTOMER_CREATE_FAILED' }, { status: 500 });
  }

  // Update parent with Stripe customer ID
  if (!parentRow.stripe_customer_id) {
    await supabaseAdmin
      .from('parents')
      .update({ stripe_customer_id: customerId })
      .eq('id', parentRow.id);
  }

  // Create a Checkout Session using server-verified price
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: block.weekly_price_cents,
            recurring: { interval: 'week', interval_count: 1 },
            product_data: {
              name: `DreamWatch Overnight - ${block.nights_per_week} Nights/Week`,
              description: 'Weekly overnight childcare subscription',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        overnight_block_id: planId,
        parent_id: parentRow.id,
      },
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/schedule`,
    });

    console.log(`[stripe] checkout session created: id=${session.id} url=${session.url}`);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] checkout session create failed:', err);
    return NextResponse.json({ error: 'Failed to create checkout session', code: 'STRIPE_SESSION_CREATE_FAILED' }, { status: 500 });
  }
}
