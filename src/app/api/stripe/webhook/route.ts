import { NextRequest, NextResponse } from 'next/server';
import {
  stripe,
  mapStripeStatus,
  nextFridayNoon,
  periodEndForBillingDate,
  updateSubscriptionTier,
} from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-server';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Idempotency: skip already-processed events.
  const { data: existingEvent } = await supabaseAdmin
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    let planId: string | null = null;

    switch (event.type) {
      case 'checkout.session.completed':
        planId = await onCheckoutCompleted(event);
        break;
      case 'invoice.paid':
        planId = await onInvoicePaid(event);
        break;
      case 'invoice.payment_failed':
        planId = await onInvoicePaymentFailed(event);
        break;
      case 'customer.subscription.updated':
        planId = await onSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        planId = await onSubscriptionDeleted(event);
        break;
    }

    // Record event for idempotency and auditing.
    await supabaseAdmin.from('billing_events').insert({
      stripe_event_id: event.id,
      event_type: event.type,
      plan_id: planId,
      payload: event.data.object as Record<string, unknown>,
    });
  } catch (err: unknown) {
    console.error(`Webhook processing error [${event.type}]:`, err);
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Event handlers ──────────────────────────────────────────────────────

async function onCheckoutCompleted(event: Stripe.Event): Promise<string | null> {
  const session = event.data.object as Stripe.Checkout.Session;
  const planId = session.metadata?.plan_id;
  const userId = session.metadata?.user_id;

  if (planId && session.subscription) {
    await supabaseAdmin
      .from('plans')
      .update({
        stripe_subscription_id: session.subscription as string,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    await supabaseAdmin.from('payments').insert({
      parent_id: userId,
      plan_id: planId,
      amount_cents: session.amount_total ?? 0,
      status: 'succeeded',
      description: 'Weekly plan subscription started',
      stripe_payment_intent_id: session.payment_intent as string,
    });
  }
  return planId ?? null;
}

/**
 * invoice.paid — weekly subscription payment succeeded.
 *
 * Actions:
 *   - Mark plan active (handles reactivation after past_due).
 *   - Record payment.
 *   - Apply any pending plan tier changes at cycle boundary.
 */
async function onInvoicePaid(event: Stripe.Event): Promise<string | null> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = (invoice as unknown as Record<string, unknown>).subscription as string;
  if (!subscriptionId) return null;

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!plan) return null;

  // Reactivate plan if it was paused due to payment failure.
  if (plan.status !== 'active') {
    await supabaseAdmin
      .from('plans')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', plan.id);
  }

  // Record payment.
  await supabaseAdmin.from('payments').insert({
    parent_id: plan.parent_id,
    plan_id: plan.id,
    amount_cents: invoice.amount_paid,
    status: 'succeeded',
    description: 'Weekly subscription payment',
    stripe_invoice_id: invoice.id,
  });

  // Apply pending plan tier changes at cycle boundary.
  await applyPendingChanges(plan.id, subscriptionId);

  return plan.id;
}

/**
 * invoice.payment_failed — weekly charge declined.
 *
 * Pauses the plan, which blocks new reservations via the subscription guard.
 */
async function onInvoicePaymentFailed(event: Stripe.Event): Promise<string | null> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = (invoice as unknown as Record<string, unknown>).subscription as string;
  if (!subscriptionId) return null;

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, parent_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!plan) return null;

  await supabaseAdmin.from('payments').insert({
    parent_id: plan.parent_id,
    plan_id: plan.id,
    amount_cents: invoice.amount_due,
    status: 'failed',
    description: 'Weekly subscription payment failed',
    stripe_invoice_id: invoice.id,
  });

  await supabaseAdmin
    .from('plans')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', plan.id);

  return plan.id;
}

/**
 * customer.subscription.updated — catches Stripe-side status changes
 * we didn't initiate (e.g. successful retry after past_due).
 */
async function onSubscriptionUpdated(event: Stripe.Event): Promise<string | null> {
  const sub = event.data.object as Stripe.Subscription;
  const newStatus = mapStripeStatus(sub.status);

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id, status')
    .eq('stripe_subscription_id', sub.id)
    .single();

  if (!plan) return null;

  if (plan.status !== newStatus) {
    await supabaseAdmin
      .from('plans')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', plan.id);
  }

  return plan.id;
}

/**
 * customer.subscription.deleted — subscription fully cancelled.
 * Fires at period end when cancel_at_period_end was set.
 */
async function onSubscriptionDeleted(event: Stripe.Event): Promise<string | null> {
  const subscription = event.data.object as Stripe.Subscription;

  const { data: plan } = await supabaseAdmin
    .from('plans')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!plan) return null;

  await supabaseAdmin
    .from('plans')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscription.id);

  return plan.id;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Apply pending plan tier changes at the billing cycle boundary.
 * Called from onInvoicePaid when a new billing cycle starts.
 */
async function applyPendingChanges(
  planId: string,
  stripeSubscriptionId: string
): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from('pending_plan_changes')
    .select('*')
    .eq('plan_id', planId)
    .lte('effective_date', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!pending) return;

  await updateSubscriptionTier(stripeSubscriptionId, pending.new_nights_per_week);

  await supabaseAdmin
    .from('plans')
    .update({
      nights_per_week: pending.new_nights_per_week,
      price_cents: pending.new_price_cents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId);

  await supabaseAdmin
    .from('pending_plan_changes')
    .delete()
    .eq('id', pending.id);
}
