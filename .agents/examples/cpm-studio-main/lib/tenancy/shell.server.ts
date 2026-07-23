import "server-only";

import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { getConvexAuthToken } from "@/lib/auth/server";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";

export const getTenantShellState = cache(async (tenantSlug: string) => {
  const token = await getConvexAuthToken();

  if (!token) {
    return {
      token: null,
      preloadedCurrentUser: null,
      currentUser: null,
      access: null,
    };
  }

  const [preloadedCurrentUser, access] = await Promise.all([
    preloadQuery(api.users.current, {}, { token }),
    getCurrentTenantWorkspace(tenantSlug),
  ]);
  const currentUser = preloadedQueryResult(preloadedCurrentUser);

  if (!currentUser) {
    return {
      token,
      preloadedCurrentUser,
      currentUser: null,
      access: null,
    };
  }

  return {
    token,
    preloadedCurrentUser,
    currentUser,
    access,
  };
});
