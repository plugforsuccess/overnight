import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const planId = session.metadata?.plan_id;

      if (planId && session.subscription) {
        // Update plan with subscription ID
        await supabaseAdmin
          .from('plans')
          .update({
            stripe_subscription_id: session.subscription as string,
            updated_at: new Date().toISOString(),
          })
          .eq('id', planId);

        // Resolve parent_id from the plan (canonical FK, not auth UUID)
        const { data: planRow } = await supabaseAdmin
          .from('plans')
          .select('parent_id')
          .eq('id', planId)
          .single();

        const parentId = planRow?.parent_id ?? session.metadata?.parent_id;

        if (parentId) {
          // Record payment
          await supabaseAdmin.from('payments').insert({
            parent_id: parentId,
            plan_id: planId,
            amount_cents: session.amount_total ?? 0,
            status: 'succeeded',
            description: 'Weekly plan subscription started',
            stripe_payment_intent_id: session.payment_intent as string,
          });
        }
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as Record<string, unknown>).subscription as string;

      // Find the plan by subscription ID
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('id, parent_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (plan) {
        await supabaseAdmin.from('payments').insert({
          parent_id: plan.parent_id,
          plan_id: plan.id,
          amount_cents: invoice.amount_paid,
          status: 'succeeded',
          description: 'Weekly subscription payment',
          stripe_invoice_id: invoice.id,
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as Record<string, unknown>).subscription as string;

      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('id, parent_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (plan) {
        await supabaseAdmin.from('payments').insert({
          parent_id: plan.parent_id,
          plan_id: plan.id,
          amount_cents: invoice.amount_due,
          status: 'failed',
          description: 'Weekly subscription payment failed',
          stripe_invoice_id: invoice.id,
        });

        // Pause the plan
        await supabaseAdmin
          .from('plans')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', plan.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabaseAdmin
        .from('plans')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
