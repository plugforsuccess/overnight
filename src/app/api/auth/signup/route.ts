import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().max(255).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
}).refine(data => {
  // Must have either firstName or fullName
  return (data.firstName && data.firstName.trim().length > 0) ||
         (data.fullName && data.fullName.trim().length > 0);
}, { message: 'First name is required', path: ['firstName'] });

export async function POST(req: NextRequest) {
  const rateLimited = rateLimit(req, { windowMs: 60_000, max: 5 });
  if (rateLimited) return rateLimited;

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map(e => e.message).join(', ') }, { status: 400 });
  }

  const { email, password, fullName, firstName, lastName, phone, address } = parsed.data;

  const derivedFirst = (firstName?.trim()) || (fullName ? fullName.trim().split(' ')[0] : '');
  const derivedLast = (lastName?.trim()) || (fullName ? fullName.trim().split(' ').slice(1).join(' ') : '');

  if (!derivedFirst) {
    return NextResponse.json({ error: 'First name is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: derivedFirst, last_name: derivedLast, role: 'parent' },
  });

  if (error) {
    // Don't leak internal error details — provide user-friendly messages
    const msg = error.message.includes('already registered')
      ? 'An account with this email already exists.'
      : 'Failed to create account. Please try again.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Create parent row in the public.parents table
  // parents.id = auth.users.id — single canonical identity
  if (data.user) {
    console.log(`[api/auth/signup] Creating parent row for user ${data.user.id} (${email})`);

    const { error: parentError } = await supabaseAdmin.from('parents').upsert({
      id: data.user.id,
      name: `${derivedFirst} ${derivedLast}`.trim() || email,
      first_name: derivedFirst,
      last_name: derivedLast,
      email,
      phone: phone?.replace(/\D/g, '') || null,
      address: address || null,
      role: 'parent',
      onboarding_status: 'parent_profile_complete',
    }, { onConflict: 'id' });

    if (parentError) {
      console.error(`[api/auth/signup] Parent row creation failed: ${parentError.message}`);
      return NextResponse.json(
        { error: 'Account created but parent profile failed. Please contact support.' },
        { status: 500 },
      );
    }

    // Verify the row was actually created
    const { data: verifyRow } = await supabaseAdmin
      .from('parents')
      .select('id, role')
      .eq('id', data.user.id)
      .single();
    console.log(`[api/auth/signup] Parent row verification: exists=${!!verifyRow} id=${verifyRow?.id ?? 'null'} role=${verifyRow?.role ?? 'null'}`);
  }

  return NextResponse.json({ user: data.user });
}
