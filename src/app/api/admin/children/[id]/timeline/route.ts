import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkAdmin(req);
  if (!admin?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: childId } = await params;
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '100', 10), 200);

  const { data: events, error } = await supabaseAdmin
    .from('care_events')
    .select('id, event_type, event_summary, actor_type, actor_label, actor_user_id, event_metadata, created_at')
    .eq('child_id', childId)
    .eq('facility_id', admin.activeFacilityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: 'Failed to load timeline' }, { status: 400 });
  return NextResponse.json({ events: events || [] });
}
