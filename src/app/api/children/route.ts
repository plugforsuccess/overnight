import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest, verifyGuardianAccess, getAccessibleChildIds } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { childBasicsSchema } from '@/lib/validation/children';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  // Get children via guardian links
  const childIds = await getAccessibleChildIds(auth.userId);

  if (childIds.length === 0) {
    // Fallback: check parent_id for users not yet in child_guardians
    const { data, error } = await auth.supabase
      .from('children')
      .select('id, parent_id, first_name, last_name, date_of_birth, medical_notes, created_at, updated_at')
      .eq('parent_id', auth.parentId)
      .order('created_at', { ascending: true });

    if (error) return badRequest(error.message);
    return NextResponse.json({ children: data });
  }

  const { data, error } = await supabaseAdmin
    .from('children')
    .select('id, parent_id, first_name, last_name, date_of_birth, medical_notes, created_at, updated_at')
    .in('id', childIds)
    .order('created_at', { ascending: true });

  if (error) return badRequest(error.message);
  return NextResponse.json({ children: data });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const parsed = childBasicsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  // Create child with parent_id (still needed for DB schema compatibility)
  const { data, error } = await auth.supabase
    .from('children')
    .insert({
      parent_id: auth.parentId,
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      date_of_birth: parsed.data.date_of_birth,
      medical_notes: parsed.data.medical_notes || null,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);

  // Create guardian link for the creating parent
  if (data) {
    await supabaseAdmin.from('child_guardians').upsert({
      child_id: data.id,
      user_id: auth.userId,
      guardian_role: 'parent',
      is_primary_guardian: true,
      can_book: true,
      can_view_billing: true,
      can_manage_pickups: true,
    }, { onConflict: 'child_id,user_id' });
  }

  return NextResponse.json({ child: data });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid request body'); }
  const { id, ...updates } = body;
  if (!id) return badRequest('Child ID is required');

  // Verify guardian access
  const guardian = await verifyGuardianAccess(auth.userId, id);
  if (!guardian) {
    // Fallback: parent_id check for backward compatibility
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const parsed = childBasicsSchema.safeParse(updates);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map(e => e.message).join(', '));
  }

  const { data, error } = await supabaseAdmin
    .from('children')
    .update({
      name: `${parsed.data.first_name} ${parsed.data.last_name}`,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      date_of_birth: parsed.data.date_of_birth,
      medical_notes: parsed.data.medical_notes || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return badRequest(error.message);
  return NextResponse.json({ child: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return badRequest('Child ID is required');

  // Verify guardian access
  const guardian = await verifyGuardianAccess(auth.userId, id);
  if (!guardian) {
    const { data: child } = await supabaseAdmin
      .from('children').select('id').eq('id', id).eq('parent_id', auth.parentId).single();
    if (!child) return unauthorized();
  }

  const { error } = await supabaseAdmin
    .from('children')
    .delete()
    .eq('id', id);

  if (error) return badRequest(error.message);
  return NextResponse.json({ success: true });
}
