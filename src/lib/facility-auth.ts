import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-server';

export type PlatformRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'NONE';
export type FacilityRole = 'ADMIN' | 'BILLING' | 'STAFF' | 'CAREGIVER' | 'PARENT';
export type OrganizationRole = 'ORG_OWNER' | 'ORG_ADMIN' | 'ORG_BILLING' | 'ORG_SUPPORT';

export interface FacilityMembership {
  facilityId: string;
  facilitySlug: string;
  role: FacilityRole;
  isActive: boolean;
}

export interface OrganizationMembership {
  organizationId: string;
  organizationSlug: string;
  role: OrganizationRole;
  isActive: boolean;
}

export interface FacilitySessionUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
  facilityMemberships: FacilityMembership[];
  organizationMemberships: OrganizationMembership[];
  activeFacilityId: string | null;
  activeFacilitySlug: string | null;
  activeFacilityRole: FacilityRole | null;
  activeOrganizationId: string | null;
  activeOrganizationSlug: string | null;
  activeOrganizationRole: OrganizationRole | null;
}

function getToken(req: NextRequest): string {
  const authHeader = req.headers.get('Authorization');
  return authHeader?.replace('Bearer ', '') || '';
}

export async function getActiveOrganization(req: NextRequest, userId: string): Promise<{ organizationId: string | null; organizationSlug: string | null }> {
  const requestedId = req.headers.get('x-organization-id');
  const requestedSlug = req.headers.get('x-organization-slug');

  if (requestedId) {
    const { data } = await supabaseAdmin.from('organizations').select('id, slug').eq('id', requestedId).maybeSingle();
    return { organizationId: data?.id ?? null, organizationSlug: data?.slug ?? null };
  }

  if (requestedSlug) {
    const { data } = await supabaseAdmin.from('organizations').select('id, slug').eq('slug', requestedSlug).maybeSingle();
    return { organizationId: data?.id ?? null, organizationSlug: data?.slug ?? null };
  }

  const { data: membership } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id, organizations!inner(slug)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return {
    organizationId: membership?.organization_id ?? null,
    organizationSlug: (membership as any)?.organizations?.slug ?? null,
  };
}

export async function getActiveFacility(req: NextRequest, userId: string): Promise<{ facilityId: string | null; facilitySlug: string | null }> {
  const requestedId = req.headers.get('x-facility-id');
  const requestedSlug = req.headers.get('x-facility-slug');
  const activeOrganization = await getActiveOrganization(req, userId);

  if (requestedId) {
    let query = supabaseAdmin.from('facilities').select('id, slug').eq('id', requestedId);
    if (activeOrganization.organizationId) query = query.eq('organization_id', activeOrganization.organizationId);
    const { data } = await query.maybeSingle();
    return { facilityId: data?.id ?? null, facilitySlug: data?.slug ?? null };
  }

  if (requestedSlug) {
    let query = supabaseAdmin.from('facilities').select('id, slug').eq('slug', requestedSlug);
    if (activeOrganization.organizationId) query = query.eq('organization_id', activeOrganization.organizationId);
    const { data } = await query.maybeSingle();
    return { facilityId: data?.id ?? null, facilitySlug: data?.slug ?? null };
  }

  const { data: membership } = await supabaseAdmin
    .from('facility_memberships')
    .select('facility_id, facilities!inner(slug, organization_id)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return {
    facilityId: membership?.facility_id ?? null,
    facilitySlug: (membership as any)?.facilities?.slug ?? null,
  };
}


export async function listFacilitiesForOrganization(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from('facilities')
    .select('id, slug, name, is_active')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to list facilities for organization: ${error.message}`);
  return data || [];
}

export function facilityWhere(facilityId: string) {
  return { facility_id: facilityId };
}

export function organizationWhere(organizationId: string) {
  return { organization_id: organizationId };
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

export async function requireOrganizationId(req: NextRequest, userId: string): Promise<string> {
  const active = await getActiveOrganization(req, userId);
  if (!active.organizationId) throw new Error('Missing active organization');
  return active.organizationId;
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

export async function hasOrganizationRole(organizationId: string, userId: string, roles: OrganizationRole[]): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', roles)
    .limit(1)
    .maybeSingle();

  return !!data?.id;
}

export const checkPlatformAdmin = (u: FacilitySessionUser) => u.platformRole === 'PLATFORM_ADMIN';
export const checkPlatformSupport = (u: FacilitySessionUser) => u.platformRole === 'PLATFORM_SUPPORT' || checkPlatformAdmin(u);
export const checkFacilityAdmin = (u: FacilitySessionUser) => u.activeFacilityRole === 'ADMIN';
export const checkFacilityBilling = (u: FacilitySessionUser) => ['ADMIN', 'BILLING'].includes(u.activeFacilityRole || '');
export const checkFacilityStaff = (u: FacilitySessionUser) => ['ADMIN', 'BILLING', 'STAFF', 'CAREGIVER'].includes(u.activeFacilityRole || '');
export const checkOrganizationOwner = (u: FacilitySessionUser) => u.activeOrganizationRole === 'ORG_OWNER';
export const checkOrganizationAdmin = (u: FacilitySessionUser) => ['ORG_OWNER', 'ORG_ADMIN'].includes(u.activeOrganizationRole || '');
export const checkOrganizationBilling = (u: FacilitySessionUser) => ['ORG_OWNER', 'ORG_ADMIN', 'ORG_BILLING'].includes(u.activeOrganizationRole || '');
export const checkOrganizationSupport = (u: FacilitySessionUser) => ['ORG_OWNER', 'ORG_ADMIN', 'ORG_SUPPORT'].includes(u.activeOrganizationRole || '');

export async function authenticateParentForFacility(req: NextRequest): Promise<FacilitySessionUser | null> {
  const token = getToken(req);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !user.email) return null;

  const { data: parent } = await supabaseAdmin.from('parents').select('id').eq('id', user.id).single();
  if (!parent) return null;

  const { data: memberships } = await supabaseAdmin
    .from('facility_memberships')
    .select('facility_id, role, is_active, facilities!inner(slug, organization_id)')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const { data: organizationMemberships } = await supabaseAdmin
    .from('organization_memberships')
    .select('organization_id, role, is_active, organizations!inner(slug)')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const activeOrganization = await getActiveOrganization(req, user.id);
  const activeFacility = await getActiveFacility(req, user.id);

  const derivedOrganizationId = activeOrganization.organizationId
    ?? (memberships || []).map((m: any) => m.facilities?.organization_id).find(Boolean)
    ?? null;

  const activeOrganizationRole = (organizationMemberships || []).find((m: any) => m.organization_id === derivedOrganizationId)?.role || null;
  const activeMembership = memberships?.find((m) => m.facility_id === activeFacility.facilityId);

  return {
    id: user.id,
    email: user.email,
    platformRole: ((user.app_metadata?.platformRole as PlatformRole) || 'NONE'),
    facilityMemberships: (memberships || []).map((m: any) => ({ facilityId: m.facility_id, facilitySlug: m.facilities.slug, role: m.role, isActive: m.is_active })),
    organizationMemberships: (organizationMemberships || []).map((m: any) => ({ organizationId: m.organization_id, organizationSlug: m.organizations.slug, role: m.role, isActive: m.is_active })),
    activeFacilityId: activeFacility.facilityId,
    activeFacilitySlug: activeFacility.facilitySlug,
    activeFacilityRole: (activeMembership?.role as FacilityRole) || null,
    activeOrganizationId: derivedOrganizationId,
    activeOrganizationSlug: activeOrganization.organizationSlug,
    activeOrganizationRole: (activeOrganizationRole as OrganizationRole) || null,
  };
}
