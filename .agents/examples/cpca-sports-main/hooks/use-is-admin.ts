"use client";

import { useAuth } from "@clerk/nextjs";
import {
  isAdminFromSessionClaims,
  isSuperAdminFromSessionClaims,
} from "@/lib/auth/roles";
import { isSingleTenantMode } from "@/lib/tenancy/config";

const SINGLE_TENANT_MODE = isSingleTenantMode();

/**
 * Hook to check if the current user has admin privileges.
 * Uses Clerk Organization roles in multi-tenant mode and user metadata in single-tenant mode.
 *
 * @returns Object containing isAdmin boolean and loading state
 */
export function useIsAdmin() {
  const { has, isLoaded, sessionClaims } = useAuth();

  if (SINGLE_TENANT_MODE) {
    const isSuperAdmin = isSuperAdminFromSessionClaims(sessionClaims);
    const isAdmin = isAdminFromSessionClaims(sessionClaims);

    return {
      isAdmin,
      isSuperAdmin,
      isOrgAdmin: false,
      isLoaded,
    };
  }

  const isSuperAdmin = has?.({ role: "org:superadmin" }) ?? false;
  const isOrgAdmin = has?.({ role: "org:admin" }) ?? false;
  const isAdmin = isOrgAdmin || isSuperAdmin;

  return {
    isAdmin,
    isSuperAdmin,
    isOrgAdmin,
    isLoaded,
  };
}
