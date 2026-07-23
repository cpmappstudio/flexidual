"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";

export function useStaffAccess() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  const access = useQuery(
    api.organizations.getStaffContext,
    isAuthenticated && orgSlug ? { orgSlug } : "skip",
  );

  return {
    access: access ?? null,
    isLoading:
      isAuthLoading ||
      (isAuthenticated && Boolean(orgSlug) && access === undefined),
  };
}
