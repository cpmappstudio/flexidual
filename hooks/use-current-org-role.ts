"use client";

import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { getRouteRole } from "@/lib/rbac";

export function useCurrentOrgRole() {
  const { sessionClaims, isLoaded } = useAuth();
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  const { access } = useStaffAccess();

  return {
    role: access?.role ?? getRouteRole(sessionClaims, orgSlug ?? "system"),
    access,
    isLoaded,
  };
}
