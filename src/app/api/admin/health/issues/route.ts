import { NextRequest, NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * GET /api/admin/health/issues?status=open&severity=critical
 * List health issues with filtering.
 */
export async function GET(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let query = supabaseAdmin
    .from('health_issues')
    .select('*')
    .order('detected_at', { ascending: false })
    .limit(100);

  const status = req.nextUrl.searchParams.get('status');
  const severity = req.nextUrl.searchParams.get('severity');
  const issueType = req.nextUrl.searchParams.get('issue_type');

  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('severity', severity);
  if (issueType) query = query.eq('issue_type', issueType);

  const { data: issues, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ issues: issues || [] });
}

/**
 * POST /api/admin/health/issues
 * Resolve/review an issue: { issueId, status, resolutionNotes }
 */
export async function POST(req: NextRequest) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { issueId, status, resolutionNotes } = await req.json();

  if (!issueId || !status) {
    return NextResponse.json({ error: 'issueId and status required' }, { status: 400 });
  }

  const validStatuses = ['reviewed', 'resolved', 'ignored'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
  }

  const updateData: any = {
    status,
    resolved_by_user_id: admin.id,
    resolution_notes: resolutionNotes || null,
  };

  if (status === 'resolved') {
    updateData.resolved_at = new Date().toISOString();
  }

  const { data: issue, error } = await supabaseAdmin
    .from('health_issues')
    .update(updateData)
    .eq('id', issueId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ issue });
}
