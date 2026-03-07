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
    console.error('[webhook] signature verification failed:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.log(`[webhook] event received: type=${event.type} id=${event.id}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const blockId = session.metadata?.overnight_block_id ?? session.metadata?.plan_id;

      console.log(`[webhook] checkout completed: blockId=${blockId} subscription=${session.subscription}`);

      if (blockId && session.subscription) {
        // Update overnight_block with subscription ID and payment status
        const { error: updateError } = await supabaseAdmin
          .from('overnight_blocks')
          .update({
            stripe_subscription_id: session.subscription as string,
            payment_status: 'paid',
            updated_at: new Date().toISOString(),
          })
          .eq('id', blockId);

        if (updateError) {
          console.error('[webhook] failed to update overnight_block:', updateError);
        }

        // Confirm all pending_payment reservations for this block
        const { error: resUpdateError } = await supabaseAdmin
          .from('reservations')
          .update({
            status: 'confirmed',
            updated_at: new Date().toISOString(),
          })
          .eq('overnight_block_id', blockId)
          .eq('status', 'pending_payment');

        if (resUpdateError) {
          console.error('[webhook] failed to confirm reservations:', resUpdateError);
        } else {
          // Emit reservation_confirmed events for each confirmed reservation
          const { data: confirmedRes } = await supabaseAdmin
            .from('reservations')
            .select('id')
            .eq('overnight_block_id', blockId)
            .eq('status', 'confirmed');

          if (confirmedRes && confirmedRes.length > 0) {
            const eventRows = confirmedRes.map((r: { id: string }) => ({
              reservation_id: r.id,
              event_type: 'reservation_confirmed',
              event_data: { block_id: blockId, payment_method: 'stripe' },
            }));
            await supabaseAdmin.from('reservation_events').insert(eventRows);
          }
        }

        // Emit payment_received events
        const { data: paidRes } = await supabaseAdmin
          .from('reservations')
          .select('id')
          .eq('overnight_block_id', blockId)
          .eq('status', 'confirmed');

        if (paidRes && paidRes.length > 0) {
          const paymentEvents = paidRes.map((r: { id: string }) => ({
            reservation_id: r.id,
            event_type: 'payment_received',
            event_data: { amount_cents: session.amount_total ?? 0, stripe_event_id: event.id },
          }));
          await supabaseAdmin.from('reservation_events').insert(paymentEvents);
        }

        // Resolve parent_id from the block
        const { data: blockRow } = await supabaseAdmin
          .from('overnight_blocks')
          .select('parent_id')
          .eq('id', blockId)
          .single();

        const parentId = blockRow?.parent_id ?? session.metadata?.parent_id;

        if (parentId) {
          try {
            await supabaseAdmin.from('payments').insert({
              parent_id: parentId,
              plan_id: blockId,
              amount_cents: session.amount_total ?? 0,
              status: 'succeeded',
              description: 'Weekly plan subscription started',
              stripe_payment_intent_id: session.payment_intent as string,
            });
          } catch (err) {
            console.warn('[webhook] payment record insert failed:', err);
          }
        }
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as Record<string, unknown>).subscription as string;

      const { data: block } = await supabaseAdmin
        .from('overnight_blocks')
        .select('id, parent_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (block) {
        console.log(`[webhook] invoice paid: blockId=${block.id} amount=${invoice.amount_paid}`);
        try {
          await supabaseAdmin.from('payments').insert({
            parent_id: block.parent_id,
            plan_id: block.id,
            amount_cents: invoice.amount_paid,
            status: 'succeeded',
            description: 'Weekly subscription payment',
            stripe_invoice_id: invoice.id,
          });
        } catch (err) {
          console.warn('[webhook] payment record insert failed:', err);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as Record<string, unknown>).subscription as string;

      const { data: block } = await supabaseAdmin
        .from('overnight_blocks')
        .select('id, parent_id')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (block) {
        console.error(`[webhook] payment failed: blockId=${block.id} amount=${invoice.amount_due}`);
        try {
          await supabaseAdmin.from('payments').insert({
            parent_id: block.parent_id,
            plan_id: block.id,
            amount_cents: invoice.amount_due,
            status: 'failed',
            description: 'Weekly subscription payment failed',
            stripe_invoice_id: invoice.id,
          });
        } catch (err) {
          console.warn('[webhook] payment record insert failed:', err);
        }

        await supabaseAdmin
          .from('overnight_blocks')
          .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', block.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      console.log(`[webhook] subscription deleted: ${subscription.id}`);
      await supabaseAdmin
        .from('overnight_blocks')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
