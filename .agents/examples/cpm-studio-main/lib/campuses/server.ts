import "server-only";

import { fetchQuery } from "convex/nextjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { getConvexAuthToken } from "@/lib/auth/server";
import {
  parseActiveProfileCookieValue,
  TENANT_ACTIVE_PROFILE_COOKIE_NAME,
} from "@/lib/tenancy/profile-selection";

async function getSelectedChildOrganizationPersonId() {
  const cookieStore = await cookies();
  const selectedProfile = parseActiveProfileCookieValue(
    cookieStore.get(TENANT_ACTIVE_PROFILE_COOKIE_NAME)?.value,
  );

  return selectedProfile?.kind === "child"
    ? selectedProfile.organizationPersonId
    : undefined;
}

export const listTenantCampuses = cache(async (slug: string) => {
  const token = await getConvexAuthToken();
  if (!token) {
    return [];
  }

  const organizationPersonId = await getSelectedChildOrganizationPersonId();
  const queryArgs = organizationPersonId
    ? { slug, organizationPersonId }
    : { slug };

  return await fetchQuery(
    api.platform.campuses.listForOrganization,
    queryArgs,
    { token },
  );
});

export const getTenantCampusBySlug = cache(
  async (tenantSlug: string, campusSlug: string) => {
    const token = await getConvexAuthToken();
    if (!token) {
      return null;
    }

    const organizationPersonId = await getSelectedChildOrganizationPersonId();
    const queryArgs = organizationPersonId
      ? { slug: tenantSlug, campusSlug, organizationPersonId }
      : { slug: tenantSlug, campusSlug };

    return await fetchQuery(
      api.platform.campuses.getBySlug,
      queryArgs,
      { token },
    );
  },
);
