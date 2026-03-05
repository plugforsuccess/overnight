import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, badRequest } from '@/lib/api-auth';
import { childBasicsSchema } from '@/lib/validation/children';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { data, error } = await auth.supabase
    .from('children')
    .select('*')
    .eq('parent_id', auth.userId)
    .order('created_at', { ascending: true });

  if (error) return badRequest(error.message);
  return NextResponse.json({ children: data });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const body = await req.json();
  const parsed = childBasicsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.errors.map(e => e.message).join(', '));
  }

  const { data, error } = await auth.supabase
    .from('children')
    .insert({
      parent_id: auth.userId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      date_of_birth: parsed.data.date_of_birth,
      medical_notes: parsed.data.medical_notes || null,
    })
    .select()
    .single();

  if (error) return badRequest(error.message);
  return NextResponse.json({ child: data });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return badRequest('Child ID is required');

  const parsed = childBasicsSchema.safeParse(updates);
  if (!parsed.success) {
    return badRequest(parsed.error.errors.map(e => e.message).join(', '));
  }

  const { data, error } = await auth.supabase
    .from('children')
    .update({
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      date_of_birth: parsed.data.date_of_birth,
      medical_notes: parsed.data.medical_notes || null,
    })
    .eq('id', id)
    .eq('parent_id', auth.userId)
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

  const { error } = await auth.supabase
    .from('children')
    .delete()
    .eq('id', id)
    .eq('parent_id', auth.userId);

  if (error) return badRequest(error.message);
  return NextResponse.json({ success: true });
}
