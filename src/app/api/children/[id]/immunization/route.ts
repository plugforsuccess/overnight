import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { immunizationRecordSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

function deriveBadge(status: string, expiresAt?: string | null) {
  if (status === 'exempt_medical' || status === 'exempt_religious') return 'exempt';
  if (status === 'missing') return 'missing';
  if (status === 'expired') return 'expired';
  if (!expiresAt) return status;
  const exp = new Date(expiresAt).getTime();
  if (exp <= Date.now()) return 'expired';
  if (exp <= Date.now() + (30 * 86400000)) return 'expiring_soon';
  return 'current';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  const { id: childId } = await params;

  const { data: child } = await auth.supabase.from('children').select('id').eq('id', childId).eq('parent_id', auth.parentId).eq('facility_id', auth.activeFacilityId).single();
  if (!child) return badRequest('Child not found');

  const { data: record, error } = await auth.supabase
    .from('child_immunization_records').select('*')
    .eq('child_id', childId).eq('facility_id', auth.activeFacilityId).single();
  if (error && error.code !== 'PGRST116') return badRequest('Failed to load immunization record');
  return NextResponse.json({ record: record || null, badge: deriveBadge(record?.status || 'missing', record?.expires_at) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  const { id: childId } = await params;

  const { data: child } = await supabaseAdmin
    .from('children').select('id, facility_id, parent_id')
    .eq('id', childId).single();
  if (!child || child.parent_id !== auth.parentId || child.facility_id !== auth.activeFacilityId) return badRequest('Child not found');

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = immunizationRecordSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map(e => e.message).join(', '));

  const { data: result, error } = await supabaseAdmin
    .from('child_immunization_records')
    .upsert({ child_id: childId, facility_id: child.facility_id, ...parsed.data }, { onConflict: 'child_id,facility_id' })
    .select().single();
  if (error) return badRequest(error.message);

  const { error: evError } = await supabaseAdmin.from('child_events').insert({
    facility_id: child.facility_id,
    child_id: childId,
    event_type: 'immunization_updated',
    event_data: { status: parsed.data.status, badge: deriveBadge(parsed.data.status, parsed.data.expires_at) },
    created_by: auth.userId,
  });
  if (evError) return NextResponse.json({ error: 'Immunization saved but event logging failed', detail: evError.message }, { status: 500 });

  return NextResponse.json({ record: result, badge: deriveBadge(result.status, result.expires_at) });
}
