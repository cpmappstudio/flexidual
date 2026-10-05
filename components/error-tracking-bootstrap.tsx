"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useParams } from "next/navigation";
import { useCurrentOrgRole } from "@/hooks/use-current-org-role";
import { getRolesFromClaims } from "@/lib/rbac";
import {
  initializeErrorTracking,
  setDiagnosticIdentity,
} from "@/lib/error-tracking";

export function ErrorTrackingBootstrap() {
  useEffect(() => {
    void initializeErrorTracking();
  }, []);
  return null;
}

export function ErrorTrackingIdentity() {
  const { userId, sessionClaims } = useAuth();
  const { role } = useCurrentOrgRole();
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  // The student shell lives at /app, without an organization in the route.
  const assignedRoles = new Set(
    Object.values(getRolesFromClaims(sessionClaims) ?? {}),
  );
  const diagnosticRole =
    role ?? (assignedRoles.size === 1 ? [...assignedRoles][0] : undefined);
  useEffect(() => {
    setDiagnosticIdentity({
      userId: userId ?? undefined,
      role: diagnosticRole,
      organization: orgSlug,
    });
    return () => setDiagnosticIdentity({});
  }, [userId, diagnosticRole, orgSlug]);
  return null;
}
