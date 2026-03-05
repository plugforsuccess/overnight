import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') || '';
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('parent_id', user.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ children: data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data, error } = await supabase
    .from('children')
    .insert({
      parent_id: user.id,
      full_name: body.full_name,
      date_of_birth: body.date_of_birth,
      allergies: body.allergies || null,
      medical_notes: body.medical_notes || null,
      emergency_contact_name: body.emergency_contact_name,
      emergency_contact_phone: body.emergency_contact_phone,
      authorized_pickup: body.authorized_pickup,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ child: data });
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  const { data, error } = await supabase
    .from('children')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('parent_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ child: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const { error } = await supabase
    .from('children')
    .delete()
    .eq('id', id)
    .eq('parent_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
