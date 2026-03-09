import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

export type PlatformRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'NONE';
export type FacilityRole = 'ADMIN' | 'BILLING' | 'STAFF' | 'CAREGIVER' | 'PARENT';

export interface FacilityMembership {
  facilityId: string;
  facilitySlug: string;
  role: FacilityRole;
  isActive: boolean;
}

export interface FacilitySessionUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
  facilityMemberships: FacilityMembership[];
  activeFacilityId: string | null;
  activeFacilitySlug: string | null;
  activeFacilityRole: FacilityRole | null;
}

function getToken(req: NextRequest): string {
  const authHeader = req.headers.get('Authorization');
  return authHeader?.replace('Bearer ', '') || '';
}

export async function getActiveFacility(req: NextRequest, userId: string): Promise<{ facilityId: string | null; facilitySlug: string | null }> {
  const requestedId = req.headers.get('x-facility-id');
  const requestedSlug = req.headers.get('x-facility-slug');

  if (requestedId) return { facilityId: requestedId, facilitySlug: requestedSlug };
  if (requestedSlug) {
    const { data } = await supabaseAdmin.from('facilities').select('id, slug').eq('slug', requestedSlug).single();
    return { facilityId: data?.id ?? null, facilitySlug: data?.slug ?? null };
  }

  const { data: membership } = await supabaseAdmin
    .from('facility_memberships')
    .select('facility_id, facilities!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return {
    facilityId: membership?.facility_id ?? null,
    facilitySlug: (membership as any)?.facilities?.slug ?? null,
  };
}

export function facilityWhere(facilityId: string) {
  return { facility_id: facilityId };
}

export function assertFacilityScope(record: { facility_id?: string | null }, facilityId: string, entityName: string) {
  if (!record?.facility_id || record.facility_id !== facilityId) {
    throw new Error(`${entityName} is out of facility scope`);
  }
}

export async function requireFacilityId(req: NextRequest, userId: string): Promise<string> {
  const active = await getActiveFacility(req, userId);
  if (!active.facilityId) throw new Error('Missing active facility');
  return active.facilityId;
}

export async function requireFacilityMembership(userId: string, facilityId: string): Promise<FacilityMembership> {
  const { data } = await supabaseAdmin
    .from('facility_memberships')
    .select('facility_id, role, is_active, facilities!inner(slug)')
    .eq('user_id', userId)
    .eq('facility_id', facilityId)
    .eq('is_active', true)
    .single();

  if (!data) throw new Error('Facility membership required');

  return {
    facilityId: data.facility_id,
    facilitySlug: (data as any).facilities.slug,
    role: data.role,
    isActive: data.is_active,
  };
}

export const checkPlatformAdmin = (u: FacilitySessionUser) => u.platformRole === 'PLATFORM_ADMIN';
export const checkPlatformSupport = (u: FacilitySessionUser) => u.platformRole === 'PLATFORM_SUPPORT' || checkPlatformAdmin(u);
export const checkFacilityAdmin = (u: FacilitySessionUser) => u.activeFacilityRole === 'ADMIN';
export const checkFacilityBilling = (u: FacilitySessionUser) => ['ADMIN', 'BILLING'].includes(u.activeFacilityRole || '');
export const checkFacilityStaff = (u: FacilitySessionUser) => ['ADMIN', 'BILLING', 'STAFF', 'CAREGIVER'].includes(u.activeFacilityRole || '');

export async function authenticateParentForFacility(req: NextRequest): Promise<FacilitySessionUser | null> {
  const token = getToken(req);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) return null;

  const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('id', user.id).single();
  if (!parent) return null;

  const { data: memberships } = await supabaseAdmin
    .from('facility_memberships')
    .select('facility_id, role, is_active, facilities!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const activeFacility = await getActiveFacility(req, user.id);
  const activeMembership = memberships?.find((m) => m.facility_id === activeFacility.facilityId);

  return {
    id: user.id,
    email: user.email,
    platformRole: ((user.app_metadata?.platformRole as PlatformRole) || 'NONE'),
    facilityMemberships: (memberships || []).map((m: any) => ({ facilityId: m.facility_id, facilitySlug: m.facilities.slug, role: m.role, isActive: m.is_active })),
    activeFacilityId: activeFacility.facilityId,
    activeFacilitySlug: activeFacility.facilitySlug,
    activeFacilityRole: (activeMembership?.role as FacilityRole) || null,
  };
}
