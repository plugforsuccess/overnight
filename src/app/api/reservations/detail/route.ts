import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, logAuditEvent } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/reservations/detail?blockId=<overnight_block_id>
 * Returns detailed reservation data for a single booking week,
 * including all nights, events, and child safety info.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { parentId } = auth;
  const { searchParams } = new URL(req.url);
  const blockId = searchParams.get('blockId');

  if (!blockId) {
    return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
  }

  // Fetch the block with ownership check
  const { data: block, error: blockError } = await supabaseAdmin
    .from('overnight_blocks')
    .select('id, week_start, child_id, nights_per_week, weekly_price_cents, status, payment_status, caregiver_notes, created_at')
    .eq('id', blockId)
    .eq('parent_id', parentId)
    .single();

  if (blockError || !block) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Fetch child with safety info + full pickup/contact details
  const { data: child } = await supabaseAdmin
    .from('children')
    .select(`
      id, first_name, last_name, date_of_birth, medical_notes,
      child_allergies(id, allergen, custom_label, severity),
      child_emergency_contacts(id, first_name, last_name, relationship, phone, is_primary, authorized_for_pickup),
      child_authorized_pickups(id, first_name, last_name, relationship, phone, is_emergency_contact, id_verified),
      child_medical_profiles(id)
    `)
    .eq('id', block.child_id)
    .single();

  // Fetch all reservations for this block
  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('id, date, status, created_at, updated_at')
    .eq('overnight_block_id', blockId)
    .order('date', { ascending: true });

  // Fetch events for all reservations in this block
  const reservationIds = (reservations || []).map((r: { id: string }) => r.id);
  let events: any[] = [];
  if (reservationIds.length > 0) {
    const { data: eventData } = await supabaseAdmin
      .from('reservation_events')
      .select('id, reservation_id, event_type, event_data, created_at')
      .in('reservation_id', reservationIds)
      .order('created_at', { ascending: true });
    events = eventData || [];
  }

  // Transform child data
  const childInfo = child ? {
    id: child.id,
    first_name: child.first_name,
    last_name: child.last_name,
    date_of_birth: child.date_of_birth,
    allergies: (child.child_allergies || []).map((a: any) => ({
      id: a.id,
      display_name: a.allergen === 'OTHER' ? (a.custom_label || 'Other') : formatAllergen(a.allergen),
      severity: a.severity,
    })),
    emergency_contacts_count: (child.child_emergency_contacts || []).length,
    authorized_pickups_count: (child.child_authorized_pickups || []).length,
    has_medical_profile: (child.child_medical_profiles || []).length > 0,
    has_medical_notes: !!child.medical_notes,
  } : null;

  // Transform authorized pickups
  const authorizedPickups = child ? (child.child_authorized_pickups || []).map((p: any) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    relationship: p.relationship,
    phone: p.phone,
    is_emergency_contact: p.is_emergency_contact,
    id_verified: p.id_verified,
  })) : [];

  // Transform emergency contacts
  const emergencyContacts = child ? (child.child_emergency_contacts || []).map((c: any) => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    relationship: c.relationship,
    phone: c.phone,
    is_primary: c.is_primary,
    authorized_for_pickup: c.authorized_for_pickup,
  })) : [];

  return NextResponse.json({
    block: {
      id: block.id,
      week_start: block.week_start,
      nights_per_week: block.nights_per_week,
      weekly_price_cents: block.weekly_price_cents,
      status: block.status,
      payment_status: block.payment_status,
      caregiver_notes: block.caregiver_notes || '',
      created_at: block.created_at,
    },
    child: childInfo,
    authorizedPickups,
    emergencyContacts,
    nights: (reservations || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    events: events.map((e: any) => ({
      id: e.id,
      reservation_id: e.reservation_id,
      event_type: e.event_type,
      event_data: e.event_data,
      created_at: e.created_at,
    })),
  });
}

/**
 * PATCH /api/reservations/detail?blockId=<overnight_block_id>
 * Update caregiver notes for a booking.
 */
export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { parentId } = auth;
  const { searchParams } = new URL(req.url);
  const blockId = searchParams.get('blockId');

  if (!blockId) {
    return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
  }

  const body = await req.json();
  const { caregiver_notes } = body;

  if (typeof caregiver_notes !== 'string' || caregiver_notes.length > 500) {
    return NextResponse.json({ error: 'Notes must be a string, max 500 characters' }, { status: 400 });
  }

  // Fetch current notes for diff in audit log
  const { data: currentBlock } = await supabaseAdmin
    .from('overnight_blocks')
    .select('caregiver_notes, child_id')
    .eq('id', blockId)
    .eq('parent_id', parentId)
    .single();

  if (!currentBlock) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const trimmedNotes = caregiver_notes.trim();

  const { error } = await supabaseAdmin
    .from('overnight_blocks')
    .update({ caregiver_notes: trimmedNotes })
    .eq('id', blockId)
    .eq('parent_id', parentId);

  if (error) {
    return NextResponse.json({ error: 'Failed to update notes' }, { status: 500 });
  }

  // Audit trail for notes changes
  await logAuditEvent(
    supabaseAdmin,
    parentId,
    'caregiver_notes.updated',
    'overnight_block',
    blockId,
    {
      child_id: currentBlock.child_id,
      had_previous_notes: !!(currentBlock.caregiver_notes),
      notes_length: trimmedNotes.length,
    }
  );

  return NextResponse.json({ success: true });
}

function formatAllergen(allergen: string): string {
  const labels: Record<string, string> = {
    PEANUT: 'Peanut', TREE_NUT: 'Tree Nut', MILK: 'Milk', EGG: 'Egg',
    WHEAT: 'Wheat', SOY: 'Soy', FISH: 'Fish', SHELLFISH: 'Shellfish',
    SESAME: 'Sesame', PENICILLIN: 'Penicillin', INSECT_STING: 'Insect Sting',
    LATEX: 'Latex', ASTHMA: 'Asthma', ENVIRONMENTAL: 'Environmental',
  };
  return labels[allergen] || allergen;
}
