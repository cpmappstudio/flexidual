import { TenantOnboardingFlow } from "@/components/tenant/tenant-onboarding-flow";
import type { TenantParams } from "@/i18n/params";
import {
  assertTenantOnboardingAccess,
  getTenantOnboardingState,
} from "@/lib/tenancy/onboarding.server";

export default async function TenantOnboardingPage({
  params,
}: {
  params: TenantParams;
}) {
  const { tenant } = await params;
  const { access } = await getTenantOnboardingState(tenant);
  const resolvedAccess = assertTenantOnboardingAccess(access);

  return (
    <TenantOnboardingFlow
      organizationId={resolvedAccess.organization._id}
      tenantSlug={tenant}
      organizationName={resolvedAccess.organization.name}
      organizationImageUrl={resolvedAccess.organization.imageUrl ?? null}
    />
  );
}
