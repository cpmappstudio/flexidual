import "server-only";

import { getTenantShellState } from "@/lib/tenancy/shell.server";
import { getInitialTenantOnboardingServiceKeys } from "@/lib/tenancy/services";

export async function getTenantOnboardingState(tenantSlug: string) {
  const { token, currentUser, access, preloadedCurrentUser } =
    await getTenantShellState(tenantSlug);

  return {
    token,
    currentUser,
    preloadedCurrentUser,
    access,
    initialSelectedServices: access
      ? getInitialTenantOnboardingServiceKeys(access.enabledCapabilityKeys)
      : [],
  };
}

export function assertTenantOnboardingAccess<T>(
  access: T | null | undefined,
): T {
  if (!access) {
    throw new Error(
      "Tenant onboarding access must be resolved by the onboarding layout.",
    );
  }

  return access;
}
