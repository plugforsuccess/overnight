'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CenterRole } from '@/lib/role-helpers';
import { FULL_ADMIN_ROLES, STAFF_ROLES, BILLING_ROLES } from '@/lib/role-helpers';

interface AdminRoleContextValue {
  role: CenterRole;
  centerId: string;
  isOwnerOrAdmin: boolean;
  isStaff: boolean;
  isBilling: boolean;
}

const AdminRoleContext = createContext<AdminRoleContextValue | null>(null);

export function AdminRoleProvider({
  role,
  centerId,
  children,
}: {
  role: CenterRole;
  centerId: string;
  children: ReactNode;
}) {
  const value: AdminRoleContextValue = {
    role,
    centerId,
    isOwnerOrAdmin: (FULL_ADMIN_ROLES as readonly string[]).includes(role),
    isStaff: (STAFF_ROLES as readonly string[]).includes(role),
    isBilling: (BILLING_ROLES as readonly string[]).includes(role),
  };

  return (
    <AdminRoleContext.Provider value={value}>
      {children}
    </AdminRoleContext.Provider>
  );
}

export function useAdminRole(): AdminRoleContextValue {
  const ctx = useContext(AdminRoleContext);
  if (!ctx) {
    throw new Error('useAdminRole must be used within an AdminRoleProvider');
  }
  return ctx;
}
