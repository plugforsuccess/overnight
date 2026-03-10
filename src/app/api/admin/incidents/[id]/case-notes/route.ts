import { NextRequest, NextResponse } from 'next/server';
import { badRequest } from '@/lib/api-auth';
import { checkFacilityStaffOrAdmin } from '@/lib/admin-auth';
import { loadIncidentCaseFileDetail } from '@/lib/incident-case-files';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';

const noteSchema = z.object({
  note_type: z.string().min(1).max(100),
  note_body: z.string().min(1).max(5000),
  is_internal: z.boolean().default(true),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkFacilityStaffOrAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }

  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map(i => i.message).join(', '));

  const detail = await loadIncidentCaseFileDetail(id, admin.activeFacilityId);
  const { data, error } = await supabaseAdmin
    .from('incident_case_notes')
    .insert({
      organization_id: detail.caseFile.organization_id,
      facility_id: detail.caseFile.facility_id,
      case_file_id: detail.caseFile.id,
      author_user_id: admin.id,
      note_type: parsed.data.note_type,
      note_body: parsed.data.note_body,
      is_internal: parsed.data.is_internal,
    })
    .select('*')
    .single();

  if (error) return badRequest(error.message);
  return NextResponse.json({ note: data }, { status: 201 });
}
