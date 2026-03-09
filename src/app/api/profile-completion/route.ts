import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getProfileCompletion } from '@/lib/profile-completion';

/**
 * GET /api/profile-completion
 * Returns the full profile completion object for the authenticated parent.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const completion = await getProfileCompletion(supabaseAdmin, auth.parentId);

  return NextResponse.json(completion);
}
