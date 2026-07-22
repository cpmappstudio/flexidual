"use client";

import { useParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePathname } from "@/i18n/navigation";
import { useAdminSchoolFilter } from "@/components/providers/admin-school-filter-provider";

export function useSettingsContext() {
  const params = useParams<{ orgSlug?: string }>();
  const pathname = usePathname();
  const { selectedSchoolId } = useAdminSchoolFilter();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const isSystem = pathname.startsWith("/admin");
  const queryArgs = isSystem
    ? selectedSchoolId !== "all"
      ? { schoolId: selectedSchoolId as Id<"schools"> }
      : null
    : params.orgSlug
      ? { orgSlug: params.orgSlug }
      : null;

  const context = useQuery(
    api.organizations.getSettingsContext,
    isAuthenticated && queryArgs ? queryArgs : "skip",
  );
  const basePath = isSystem ? "/admin/settings" : `/${params.orgSlug}/settings`;

  return {
    context,
    isLoading:
      isAuthLoading ||
      (isAuthenticated && queryArgs !== null && context === undefined),
    basePath,
    profilePath: `${basePath}/profile`,
  };
}
