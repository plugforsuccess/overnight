import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Idempotency protection for critical write APIs.
 *
 * Clients pass `Idempotency-Key: <uuid>` header on POST/PATCH requests.
 * If the key has been seen before, the cached response is returned immediately
 * without re-executing the handler. If the key is new, the handler executes
 * and its response is cached for future replays.
 *
 * Storage: idempotency_keys table (auto-expires after 24 hours via DB policy).
 *
 * Usage:
 *   const cached = await checkIdempotencyKey(req);
 *   if (cached) return cached;
 *   // ... execute handler ...
 *   await saveIdempotencyResult(key, statusCode, responseBody);
 */

export function getIdempotencyKey(req: NextRequest): string | null {
  return req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key') || null;
}

/**
 * Check if an idempotency key has been used before.
 * Returns the cached response if found, null otherwise.
 */
export async function checkIdempotencyKey(
  req: NextRequest,
): Promise<NextResponse | null> {
  const key = getIdempotencyKey(req);
  if (!key) return null; // No key = no idempotency protection (backward compatible)

  // Validate key format (should be UUID-like)
  if (!/^[a-f0-9-]{8,64}$/i.test(key)) return null;

  const { data } = await supabaseAdmin
    .from('idempotency_keys')
    .select('response_status, response_body')
    .eq('key', key)
    .single();

  if (!data) return null;

  // Return cached response
  return NextResponse.json(
    data.response_body,
    { status: data.response_status, headers: { 'X-Idempotency-Replay': 'true' } },
  );
}

/**
 * Save the result of an idempotent operation for future replay.
 * Call this AFTER the handler has successfully produced a response.
 */
export async function saveIdempotencyResult(
  req: NextRequest,
  userId: string,
  status: number,
  body: unknown,
): Promise<void> {
  const key = getIdempotencyKey(req);
  if (!key) return;
  if (!/^[a-f0-9-]{8,64}$/i.test(key)) return;

  await supabaseAdmin.from('idempotency_keys').upsert({
    key,
    user_id: userId,
    request_path: new URL(req.url).pathname,
    response_status: status,
    response_body: body,
  }, { onConflict: 'key' });
}
