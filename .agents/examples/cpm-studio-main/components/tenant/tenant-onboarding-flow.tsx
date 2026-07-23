"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useTenantOnboarding } from "@/components/tenant/tenant-onboarding-provider";
import { TenantOnboardingInviteStep } from "@/components/tenant/tenant-onboarding-invite-step";
import { TenantOnboardingServicePicker } from "@/components/tenant/tenant-onboarding-service-picker";
import { useTenantOnboardingNavigation } from "@/hooks/tenant/use-tenant-onboarding-navigation";
import { useRouter } from "@/i18n/navigation";
import { listImplementedModuleManifests } from "@/lib/modules/registry";
import { ROUTES } from "@/lib/navigation/routes";

export function TenantOnboardingFlow({
  organizationId,
  tenantSlug,
  organizationName,
  organizationImageUrl,
}: {
  organizationId: Id<"organizations">;
  tenantSlug: string;
  organizationName: string;
  organizationImageUrl: string | null;
}) {
  const t = useTranslations("TenantOnboarding");
  const { replace } = useRouter();
  const setCapabilitiesForOrganization = useMutation(
    api.platform.capabilities.setManyForOrganization,
  );
  const { currentStep, navigateToStep, replaceToStep } =
    useTenantOnboardingNavigation();
  const { selectedServices, toggleService, canAccessInviteTeammates } =
    useTenantOnboarding();
  const [isSaving, setIsSaving] = useState(false);
  const implementedManifests = useMemo(() => listImplementedModuleManifests(), []);

  const effectiveStep =
    currentStep === "invite-teammates" && !canAccessInviteTeammates
      ? "services"
      : currentStep;

  useEffect(() => {
    if (currentStep === "invite-teammates" && !canAccessInviteTeammates) {
      replaceToStep("services");
    }
  }, [canAccessInviteTeammates, currentStep, replaceToStep]);

  async function handleContinueFromServices() {
    setIsSaving(true);

    try {
      const selectedKeySet = new Set(selectedServices);
      const entries = implementedManifests.flatMap((manifest) =>
        manifest.requiredCapabilities.map((capabilityKey) =>
          ({
            capabilityKey,
            enabled: selectedKeySet.has(manifest.key),
          })
        ),
      );

      await setCapabilitiesForOrganization({
        organizationId,
        entries,
      });
      navigateToStep("invite-teammates");
    } catch {
      toast.error(t("saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  if (effectiveStep === "invite-teammates") {
    return (
      <TenantOnboardingInviteStep
        institutionName={organizationName}
        institutionImageUrl={organizationImageUrl}
        title={t("inviteTeammates.title")}
        description={t("inviteTeammates.pendingDescription")}
        backLabel={t("backToServices")}
        finishLabel={t("inviteTeammates.finish")}
        addInviteLabel={t("inviteTeammates.addInvite")}
        messageLabel={t("inviteTeammates.messageLabel")}
        messagePlaceholder={t("inviteTeammates.messagePlaceholder")}
        emailLabel={t("inviteTeammates.emailLabel")}
        emailPlaceholder={t("inviteTeammates.emailPlaceholder")}
        roleLabel={t("inviteTeammates.roleLabel")}
        emptyStateLabel={t("inviteTeammates.removeInvite")}
        onBack={() => navigateToStep("services")}
        onFinish={() => replace(ROUTES.tenant.root(tenantSlug))}
      />
    );
  }

  return (
    <TenantOnboardingServicePicker
      organizationName={organizationName}
      organizationImageUrl={organizationImageUrl}
      selectedServices={selectedServices}
      onToggleService={toggleService}
      canContinue={canAccessInviteTeammates && !isSaving}
      continueLabel={t("continue")}
      onContinue={() => void handleContinueFromServices()}
    />
  );
}
