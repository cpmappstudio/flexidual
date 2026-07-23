"use client";

import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  getTenantOnboardingStep,
  getTenantOnboardingStepHref,
  type TenantOnboardingStep,
} from "@/lib/tenancy/onboarding";

export function useTenantOnboardingNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStep = getTenantOnboardingStep(searchParams.get("step"));

  function getStepHref(step: TenantOnboardingStep) {
    return getTenantOnboardingStepHref(pathname, step, searchParams);
  }

  function navigateToStep(step: TenantOnboardingStep) {
    router.push(getStepHref(step));
  }

  function replaceToStep(step: TenantOnboardingStep) {
    router.replace(getStepHref(step));
  }

  return {
    currentStep,
    navigateToStep,
    replaceToStep,
    getStepHref,
  };
}
