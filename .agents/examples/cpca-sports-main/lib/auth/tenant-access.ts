import "server-only";

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { getAuthToken } from "@/lib/auth/auth";
import {
  hasSingleTenantAccessFromSessionClaims,
  isAdminFromSessionClaims,
} from "@/lib/auth/roles";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "@/lib/tenancy/config";

interface TenantAccess {
  hasAccess: boolean;
  isAdmin: boolean;
}

function isAdminRole(role: string | undefined) {
  return role === "admin" || role === "superadmin";
}

/**
 * Resolve the current user's access level for a tenant slug.
 * Uses Convex memberships so it doesn't depend on Clerk active-org sync timing.
 */
export async function getTenantAccess(
  tenant: string,
  token?: string,
): Promise<TenantAccess> {
  if (isSingleTenantMode()) {
    const authObject = await auth();
    const hasCanonicalTenant = tenant === DEFAULT_TENANT_SLUG;
    const hasAccess =
      Boolean(authObject.userId) &&
      hasCanonicalTenant &&
      hasSingleTenantAccessFromSessionClaims(authObject.sessionClaims);
    const isAdmin =
      Boolean(authObject.userId) &&
      hasCanonicalTenant &&
      isAdminFromSessionClaims(authObject.sessionClaims);

    return { hasAccess, isAdmin };
  }

  const resolvedToken = token ?? (await getAuthToken());
  const currentUser = await fetchQuery(
    api.users.me,
    {},
    { token: resolvedToken },
  );

  if (!currentUser) {
    return { hasAccess: false, isAdmin: false };
  }

  const membership = currentUser.memberships.find(
    (item) => item.organizationSlug === tenant,
  );
  const hasAccess = currentUser.isSuperAdmin || Boolean(membership);
  const isAdmin = currentUser.isSuperAdmin || isAdminRole(membership?.role);

  return { hasAccess, isAdmin };
}
