"use client";

import { useParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useSettingsContext() {
  const params = useParams<{ orgSlug?: string }>();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const queryArgs = params.orgSlug ? { orgSlug: params.orgSlug } : null;

  const context = useQuery(
    api.organizations.getSettingsContext,
    isAuthenticated && queryArgs ? queryArgs : "skip",
  );
  const basePath = `/${params.orgSlug}/settings`;

  return {
    context,
    isLoading:
      isAuthLoading ||
      (isAuthenticated && queryArgs !== null && context === undefined),
    basePath,
    profilePath: `${basePath}/profile`,
  };
}
