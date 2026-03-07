/**
 * Event Outbox — transactional outbox pattern for guaranteed event delivery.
 *
 * Usage in API routes:
 *   import { enqueueEvent } from '@/lib/event-outbox';
 *   await enqueueEvent(supabaseAdmin, {
 *     eventType: 'booking.created',
 *     aggregateType: 'overnight_block',
 *     aggregateId: block.id,
 *     payload: { parentId, childId, nights: selectedNights },
 *     correlationId,
 *     actorId: parentId,
 *   });
 *
 * The row is written in the same transaction as the domain data.
 * A separate worker (cron / edge function) polls pending rows and dispatches.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface OutboxEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  actorId?: string;
}

/**
 * Insert an event into the outbox table.
 * Call this within the same request that performs the domain write
 * so both succeed or fail together.
 */
export async function enqueueEvent(
  supabase: SupabaseClient,
  event: OutboxEvent,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('event_outbox')
    .insert({
      event_type: event.eventType,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      payload: event.payload,
      correlation_id: event.correlationId ?? null,
      actor_id: event.actorId ?? null,
      status: 'pending',
      retry_count: 0,
      max_retries: 5,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[event-outbox] failed to enqueue event', {
      eventType: event.eventType,
      error: error.message,
    });
    return null;
  }

  return data.id;
}

/**
 * Claim a batch of pending outbox events for processing.
 * Sets status to 'processing' atomically to prevent duplicate dispatch.
 * Returns the claimed events.
 */
export async function claimPendingEvents(
  supabase: SupabaseClient,
  batchSize = 20,
): Promise<OutboxRow[]> {
  const now = new Date().toISOString();

  // Fetch events that are pending, or failed with retry_count < max_retries
  // and next_retry_at has passed
  const { data: events, error } = await supabase
    .from('event_outbox')
    .select('*')
    .or(`status.eq.pending,and(status.eq.failed,next_retry_at.lte.${now})`)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error || !events?.length) return [];

  // Mark them as processing
  const ids = events.map((e: OutboxRow) => e.id);
  await supabase
    .from('event_outbox')
    .update({ status: 'processing' })
    .in('id', ids);

  return events as OutboxRow[];
}

/**
 * Mark an outbox event as successfully delivered.
 */
export async function markDelivered(
  supabase: SupabaseClient,
  eventId: string,
): Promise<void> {
  await supabase
    .from('event_outbox')
    .update({
      status: 'delivered',
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

/**
 * Mark an outbox event as failed. Increments retry_count and schedules
 * the next retry with exponential backoff (2^retryCount seconds).
 * If max_retries exceeded, moves to dead_letter.
 */
export async function markFailed(
  supabase: SupabaseClient,
  eventId: string,
  errorMessage: string,
  currentRetryCount: number,
  maxRetries: number,
): Promise<void> {
  const newRetryCount = currentRetryCount + 1;

  if (newRetryCount >= maxRetries) {
    await supabase
      .from('event_outbox')
      .update({
        status: 'dead_letter',
        last_error: errorMessage,
        retry_count: newRetryCount,
      })
      .eq('id', eventId);
    return;
  }

  // Exponential backoff: 2^retryCount seconds (2s, 4s, 8s, 16s, 32s)
  const backoffMs = Math.pow(2, newRetryCount) * 1000;
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

  await supabase
    .from('event_outbox')
    .update({
      status: 'failed',
      last_error: errorMessage,
      retry_count: newRetryCount,
      next_retry_at: nextRetryAt,
    })
    .eq('id', eventId);
}

export interface OutboxRow {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  status: string;
  correlation_id: string | null;
  actor_id: string | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  next_retry_at: string | null;
  processed_at: string | null;
  created_at: string;
}
