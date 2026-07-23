"use client";

import { TenantActivityRecorder } from "@/components/tenant/tenant-activity-recorder";
import { useTenantActiveProfileSelection } from "@/hooks/tenant/use-tenant-active-profile-selection";

export function TenantProfileScopedActivityRecorder({
  profileSelectionEnabled,
  slug,
}: {
  profileSelectionEnabled: boolean;
  slug: string;
}) {
  const activeProfile = useTenantActiveProfileSelection({
    enabled: profileSelectionEnabled,
    slug,
  });

  if (!activeProfile.isReady) {
    return null;
  }

  return (
    <TenantActivityRecorder
      slug={slug}
      organizationPersonId={activeProfile.organizationPersonId ?? undefined}
    />
  );
}
