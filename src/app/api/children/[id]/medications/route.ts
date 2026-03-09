import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { medicationAuthorizationSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;
  const { data: child } = await auth.supabase.from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).eq('facility_id', auth.activeFacilityId).single();
  if (!child) return badRequest('Child not found');

  const { data, error } = await auth.supabase
    .from('medication_authorizations')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false });
  if (error) return badRequest('Failed to load medications');

  const now = Date.now();
  const medications = (data || []).map((m: any) => ({
    ...m,
    is_expired: !!m.end_date && new Date(m.end_date).getTime() <= now,
    is_valid_for_booking: (m.is_active !== false) && (!m.end_date || new Date(m.end_date).getTime() > now),
  }));
  return NextResponse.json({ medications });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { id: childId } = await params;
  const { data: child } = await supabaseAdmin.from('children').select('id, facility_id, parent_id').eq('id', childId).single();
  if (!child || child.parent_id !== auth.parentId || child.facility_id !== auth.activeFacilityId) return badRequest('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = medicationAuthorizationSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map(e => e.message).join(', '));

  const { data, error } = await supabaseAdmin
    .from('medication_authorizations')
    .insert({ child_id: childId, facility_id: child.facility_id, ...parsed.data, parent_consent_signed_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return badRequest(error.message);

  await supabaseAdmin.from('child_events').insert({
    child_id: childId,
    facility_id: child.facility_id,
    event_type: 'medication_authorization_uploaded',
    event_data: { medication_name: parsed.data.medication_name, authorization_id: data.id },
    created_by: auth.userId,
  });

  return NextResponse.json({ medication: data });
}
