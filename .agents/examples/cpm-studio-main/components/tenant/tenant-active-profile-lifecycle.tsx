"use client";

import { useTenantActiveProfileLifecycle } from "@/hooks/tenant/use-tenant-active-profile-lifecycle";

export function TenantActiveProfileLifecycle({
  enabled,
}: {
  enabled: boolean;
}) {
  useTenantActiveProfileLifecycle(enabled);

  return null;
}
