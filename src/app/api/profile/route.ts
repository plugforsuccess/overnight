import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { parentProfileSchema } from '@/lib/validation/children';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  const { data: parent, error } = await supabaseAdmin
    .from('parents')
    .select('id, first_name, last_name, email, phone, address')
    .eq('id', auth.parentId)
    .single();

  if (error || !parent) return badRequest('Parent not found');
  return NextResponse.json({ profile: parent });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }

  const parsed = parentProfileSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await supabaseAdmin
    .from('parents')
    .update(parsed.data)
    .eq('id', auth.parentId)
    .select('id, first_name, last_name, email, phone, address')
    .single();

  if (error) return badRequest(error.message);
  return NextResponse.json({ profile: data });
}
