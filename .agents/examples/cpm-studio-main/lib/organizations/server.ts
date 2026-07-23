import "server-only";

import { fetchQuery } from "convex/nextjs";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { getConvexAuthToken } from "@/lib/auth/server";

export const getOrganizationBySlug = cache(async (slug: string) => {
  return await fetchQuery(api.organizations.getBySlug, { slug });
});

// Returns the tenant workspace context for the current user, or null when the
// user is not authenticated or has no access. Cached per-request so metadata
// generators and layouts share a single network call.
export const getCurrentTenantWorkspace = cache(async (slug: string) => {
  const token = await getConvexAuthToken();
  if (!token) {
    return null;
  }

  return await fetchQuery(
    api.platform.workspace.getCurrentTenantWorkspace,
    { slug },
    { token },
  );
});
