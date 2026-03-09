import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();
  if (!auth.activeFacilityId) return unauthorized();
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from('child_documents')
    .select('id, child_id, facility_id, storage_path')
    .eq('id', id)
    .eq('facility_id', auth.activeFacilityId)
    .single();
  if (!doc) return badRequest('Document not found');

  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id, parent_id')
    .eq('id', doc.child_id)
    .single();
  if (!child || child.parent_id !== auth.parentId) return unauthorized();

  await supabaseAdmin.from('child_documents').update({ is_active: false }).eq('id', id);
  if (doc.storage_path) await supabaseAdmin.storage.from('private').remove([doc.storage_path]);

  await supabaseAdmin.from('child_events').insert({
    child_id: doc.child_id,
    facility_id: doc.facility_id,
    event_type: 'child_document_deleted',
    event_data: { document_id: id },
    created_by: auth.userId,
  });

  return NextResponse.json({ ok: true });
}
