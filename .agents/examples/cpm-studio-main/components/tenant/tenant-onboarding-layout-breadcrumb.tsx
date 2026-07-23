"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useTenantOnboarding } from "@/components/tenant/tenant-onboarding-provider";
import { Link } from "@/i18n/navigation";
import type { TenantOnboardingStep } from "@/lib/tenancy/onboarding";
import { useTenantOnboardingNavigation } from "@/hooks/tenant/use-tenant-onboarding-navigation";

export function TenantOnboardingLayoutBreadcrumb() {
  const t = useTranslations("TenantOnboarding");
  const { currentStep, getStepHref } = useTenantOnboardingNavigation();
  const { canAccessInviteTeammates } = useTenantOnboarding();
  const breadcrumbItems: Array<{ step: TenantOnboardingStep; label: string }> = [
    { step: "services", label: t("steps.services.title") },
    {
      step: "invite-teammates",
      label: t("steps.inviteTeammates.title"),
    },
  ];

  return (
    <Breadcrumb className="mb-8">
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => {
          const isCurrent = item.step === currentStep;
          const isDisabled =
            item.step === "invite-teammates" && !canAccessInviteTeammates;

          return (
            <Fragment key={item.step}>
              <BreadcrumbItem>
                {isCurrent ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : isDisabled ? (
                  <span
                    aria-disabled="true"
                    className="cursor-not-allowed text-muted-foreground/60"
                  >
                    {item.label}
                  </span>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={getStepHref(item.step)}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index < breadcrumbItems.length - 1 ? <BreadcrumbSeparator /> : null}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
