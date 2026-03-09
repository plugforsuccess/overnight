import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

const ALLOWED_EVENT_METADATA_KEYS = ['method', 'care_date', 'status', 'severity', 'category', 'check_in_method', 'check_out_method'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth?.activeFacilityId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: childId } = await params;
  const { data: child } = await supabaseAdmin
    .from('children')
    .select('id')
    .eq('id', childId)
    .eq('parent_id', auth.parentId)
    .eq('facility_id', auth.activeFacilityId)
    .single();

  if (!child) return NextResponse.json({ error: 'Child not found' }, { status: 404 });

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '50', 10), 100);
  const { data: events, error } = await supabaseAdmin
    .from('care_events')
    .select('id, event_type, event_summary, actor_label, event_metadata, created_at')
    .eq('child_id', childId)
    .eq('facility_id', auth.activeFacilityId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: 'Failed to load activity' }, { status: 400 });

  const safeEvents = (events || []).map((e: any) => ({
    id: e.id,
    event_type: e.event_type,
    event_summary: e.event_summary,
    actor_label: e.actor_label,
    created_at: e.created_at,
    event_metadata: Object.fromEntries(Object.entries(e.event_metadata || {}).filter(([k]) => ALLOWED_EVENT_METADATA_KEYS.includes(k))),
  }));

  return NextResponse.json({ events: safeEvents });
}
