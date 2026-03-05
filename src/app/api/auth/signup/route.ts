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

  // Create parent row in the public.parents table
  if (data.user) {
    const { error: parentError } = await supabaseAdmin.from('parents').insert({
      auth_user_id: data.user.id,
      name: fullName,
      email,
      phone: phone || null,
      address: address || null,
      role: 'parent',
    });

    if (parentError) {
      return NextResponse.json(
        { error: `Account created but parent profile failed: ${parentError.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ user: data.user });
}
