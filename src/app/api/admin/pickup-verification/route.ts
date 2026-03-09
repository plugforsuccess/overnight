import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { checkStaff } from '@/lib/admin-auth';
import { verifyPin } from '@/lib/pin-hash';
import { rateLimit } from '@/lib/rate-limit';

const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

/**
 * GET /api/admin/pickup-verification
 * List children with their authorized pickups for the verification UI.
 */
export async function GET(req: NextRequest) {
  const auth = await checkStaff(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminId = auth.userId;

  const { searchParams } = new URL(req.url);
  const childId = searchParams.get('childId');

  if (childId) {
    // Get specific child's authorized pickups (never return PIN hash)
    const { data: child } = await supabaseAdmin
      .from('children')
      .select('id, first_name, last_name, parent_id')
      .eq('id', childId)
      .single();

    if (!child) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 });
    }

    const { data: pickups } = await supabaseAdmin
      .from('child_authorized_pickups')
      .select('id, child_id, first_name, last_name, relationship, phone, id_verified, id_verified_at, id_verified_by, notes, created_at')
      .eq('child_id', childId)
      .order('created_at', { ascending: true });

    return NextResponse.json({ child, pickups: pickups || [] });
  }

  // List all children (for the child selector)
  const { data: children } = await supabaseAdmin
    .from('children')
    .select('id, first_name, last_name, parent_id')
    .order('first_name', { ascending: true });

  return NextResponse.json({ children: children || [] });
}

/**
 * POST /api/admin/pickup-verification
 * Verify a pickup PIN.
 *
 * Body: { pickupId: string, pin: string }
 * Returns: { verified: boolean, message: string }
 */
export async function POST(req: NextRequest) {
  const rateLimited = rateLimit(req, { windowMs: 60_000, max: 20 });
  if (rateLimited) return rateLimited;

  const auth = await checkStaff(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminId = auth.userId;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { pickupId, pin } = body;
  if (!pickupId || !pin) {
    return NextResponse.json({ error: 'pickupId and pin are required' }, { status: 400 });
  }

  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4-6 digits' }, { status: 400 });
  }

  // Get the pickup record (including hash for verification)
  const { data: pickup } = await supabaseAdmin
    .from('child_authorized_pickups')
    .select('id, child_id, first_name, last_name, pickup_pin_hash')
    .eq('id', pickupId)
    .single();

  if (!pickup) {
    return NextResponse.json({ error: 'Authorized pickup not found' }, { status: 404 });
  }

  // Check for lockout (recent failed attempts)
  const lockoutCutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();
  const { count: recentFailures } = await supabaseAdmin
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('entity_type', 'pickup_verification')
    .eq('entity_id', pickupId)
    .eq('action', 'pin_verification_failed')
    .gte('created_at', lockoutCutoff);

  if ((recentFailures ?? 0) >= MAX_PIN_ATTEMPTS) {
    // Log the locked attempt
    await supabaseAdmin.from('audit_log').insert({
      actor_id: adminId,
      action: 'pin_verification_locked',
      entity_type: 'pickup_verification',
      entity_id: pickupId,
      metadata: { child_id: pickup.child_id, reason: 'too_many_attempts' },
    });

    return NextResponse.json({
      verified: false,
      message: `Too many failed attempts. Verification locked for ${LOCKOUT_MINUTES} minutes. Use photo ID instead.`,
    }, { status: 429 });
  }

  // Verify the PIN
  const isValid = await verifyPin(pin, pickup.pickup_pin_hash);

  // Log the verification attempt
  await supabaseAdmin.from('audit_log').insert({
    actor_id: adminId,
    action: isValid ? 'pin_verification_success' : 'pin_verification_failed',
    entity_type: 'pickup_verification',
    entity_id: pickupId,
    metadata: {
      child_id: pickup.child_id,
      pickup_name: `${pickup.first_name} ${pickup.last_name}`,
    },
  });

  if (isValid) {
    // Update id_verified status
    await supabaseAdmin
      .from('child_authorized_pickups')
      .update({
        id_verified: true,
        id_verified_at: new Date().toISOString(),
        id_verified_by: adminId,
      })
      .eq('id', pickupId);

    // Log pickup event for legal protection and parent notification
    await supabaseAdmin.from('pickup_events').insert({
      child_id: pickup.child_id,
      pickup_person_id: pickupId,
      verified_by_staff_id: adminId,
      verification_method: 'pin',
    }).then(() => {}, () => {
      // pickup_events table may not exist yet — fail silently
      console.warn('[pickup-verification] pickup_events insert skipped (table may not exist)');
    });

    return NextResponse.json({
      verified: true,
      message: `VERIFIED - ${pickup.first_name} ${pickup.last_name} is authorized for pickup.`,
    });
  }

  const attemptsRemaining = MAX_PIN_ATTEMPTS - (recentFailures ?? 0) - 1;
  return NextResponse.json({
    verified: false,
    message: `INVALID PIN. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining before lockout.`,
  });
}
