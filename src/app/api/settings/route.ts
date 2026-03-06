import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorized, logAuditEvent } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-server';
import { z } from 'zod';

// ─── Validation schemas ──────────────────────────────────────────────────────

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  phone: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
});

const passwordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((data: { new_password: string; confirm_password: string }) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

const notificationSchema = z.object({
  email_notifications: z.boolean(),
  sms_notifications: z.boolean(),
  reservation_reminders: z.boolean(),
  billing_reminders: z.boolean(),
  emergency_alerts: z.boolean(),
});

const safetySchema = z.object({
  require_pickup_pin: z.boolean(),
  notify_on_check_in_out: z.boolean(),
  notify_on_pickup_changes: z.boolean(),
  emergency_contact_reminder: z.boolean(),
});

const preferencesSchema = z.object({
  preferred_contact_method: z.string().max(50).nullable().optional(),
  preferred_reminder_timing: z.string().max(50).nullable().optional(),
  staff_notes: z.string().max(1000).nullable().optional(),
  language_preference: z.string().max(20).nullable().optional(),
});

/**
 * GET /api/settings
 * Returns profile and settings for the authenticated parent.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { parentId } = auth;

  const [profileRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from('parents')
      .select('first_name, last_name, email, phone, address, created_at')
      .eq('id', parentId)
      .single(),
    supabaseAdmin
      .from('parent_settings')
      .select('*')
      .eq('parent_id', parentId)
      .single(),
  ]);

  if (profileRes.error || !profileRes.data) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }

  // If no settings row exists, return defaults
  const defaultSettings = {
    email_notifications: true,
    sms_notifications: false,
    reservation_reminders: true,
    billing_reminders: true,
    emergency_alerts: true,
    require_pickup_pin: true,
    notify_on_check_in_out: true,
    notify_on_pickup_changes: true,
    emergency_contact_reminder: true,
    preferred_contact_method: null,
    preferred_reminder_timing: null,
    staff_notes: null,
    language_preference: null,
  };

  return NextResponse.json({
    profile: profileRes.data,
    settings: settingsRes.data || defaultSettings,
  });
}

/**
 * PATCH /api/settings
 * Update profile, settings, or password.
 * Body must include a `section` field: 'profile' | 'password' | 'notifications' | 'safety' | 'preferences'
 */
export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorized();

  const { parentId, supabase } = auth;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { section, ...data } = body;

  switch (section) {
    case 'profile': {
      const parsed = profileSchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({
          error: parsed.error.errors.map((e: { message: string }) => e.message).join(', '),
        }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from('parents')
        .update({
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          phone: parsed.data.phone ?? null,
          address: parsed.data.address ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentId);

      if (error) {
        console.error('[api/settings] profile update error:', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
      }

      await logAuditEvent(supabaseAdmin, parentId, 'profile.updated', 'parent', parentId, {
        fields: Object.keys(parsed.data),
      });

      return NextResponse.json({ success: true });
    }

    case 'password': {
      const parsed = passwordSchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({
          error: parsed.error.errors.map((e: { message: string }) => e.message).join(', '),
        }, { status: 400 });
      }

      // Use Supabase Auth admin to update password
      const { error } = await supabaseAdmin.auth.admin.updateUserById(parentId, {
        password: parsed.data.new_password,
      });

      if (error) {
        console.error('[api/settings] password update error:', error);
        return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
      }

      await logAuditEvent(supabaseAdmin, parentId, 'password.changed', 'parent', parentId, {});

      return NextResponse.json({ success: true });
    }

    case 'notifications': {
      const parsed = notificationSchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({
          error: parsed.error.errors.map((e: { message: string }) => e.message).join(', '),
        }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from('parent_settings')
        .upsert({
          parent_id: parentId,
          ...parsed.data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'parent_id' });

      if (error) {
        console.error('[api/settings] notifications update error:', error);
        return NextResponse.json({ error: 'Failed to update notification preferences' }, { status: 500 });
      }

      await logAuditEvent(supabaseAdmin, parentId, 'notifications.updated', 'parent_settings', parentId, parsed.data);

      return NextResponse.json({ success: true });
    }

    case 'safety': {
      const parsed = safetySchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({
          error: parsed.error.errors.map((e: { message: string }) => e.message).join(', '),
        }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from('parent_settings')
        .upsert({
          parent_id: parentId,
          ...parsed.data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'parent_id' });

      if (error) {
        console.error('[api/settings] safety update error:', error);
        return NextResponse.json({ error: 'Failed to update safety preferences' }, { status: 500 });
      }

      await logAuditEvent(supabaseAdmin, parentId, 'safety_preferences.updated', 'parent_settings', parentId, parsed.data);

      return NextResponse.json({ success: true });
    }

    case 'preferences': {
      const parsed = preferencesSchema.safeParse(data);
      if (!parsed.success) {
        return NextResponse.json({
          error: parsed.error.errors.map((e: { message: string }) => e.message).join(', '),
        }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from('parent_settings')
        .upsert({
          parent_id: parentId,
          ...parsed.data,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'parent_id' });

      if (error) {
        console.error('[api/settings] preferences update error:', error);
        return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    case 'delete_account_request': {
      // Don't actually delete — log the request for manual processing
      await logAuditEvent(supabaseAdmin, parentId, 'account_deletion.requested', 'parent', parentId, {
        requested_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: 'Your account deletion request has been submitted. Our team will process it within 5 business days.',
      });
    }

    default:
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }
}
