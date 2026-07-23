import "server-only";

import { redirect as nextRedirect } from "next/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";

type CurrentTenantWorkspace = NonNullable<
  Awaited<ReturnType<typeof getCurrentTenantWorkspace>>
>;

export function canManageTenantWorkspace(
  workspace: Pick<
    CurrentTenantWorkspace,
    "effectiveRole" | "isPlatformAdmin"
  >,
) {
  return (
    workspace.isPlatformAdmin ||
    workspace.effectiveRole === "owner" ||
    workspace.effectiveRole === "admin"
  );
}

export async function requireManageableTenantWorkspace(tenantSlug: string) {
  const workspace = await getCurrentTenantWorkspace(tenantSlug);

  if (!workspace || !canManageTenantWorkspace(workspace)) {
    nextRedirect(ROUTES.tenant.root(tenantSlug));
  }

  return workspace;
}
