import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const { email, password, fullName, phone, address } = await req.json();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'parent' },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update profile with phone and address
  if (data.user) {
    await supabaseAdmin.from('profiles').update({
      phone,
      address,
    }).eq('id', data.user.id);
  }

  return NextResponse.json({ user: data.user });
}
