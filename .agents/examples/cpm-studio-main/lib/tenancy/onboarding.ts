export const tenantOnboardingSteps = [
  "services",
  "invite-teammates",
] as const;

export type TenantOnboardingStep = (typeof tenantOnboardingSteps)[number];

export function getTenantOnboardingStep(
  step: string | null | undefined,
): TenantOnboardingStep {
  if (step === "invite-teammates") {
    return "invite-teammates";
  }

  return "services";
}

export function getTenantOnboardingStepHref(
  pathname: string,
  step: TenantOnboardingStep,
  searchParams?:
    | URLSearchParams
    | {
        toString(): string;
      }
    | null,
) {
  const nextSearchParams = new URLSearchParams(searchParams?.toString() ?? "");

  if (step === "services") {
    nextSearchParams.delete("step");
  } else {
    nextSearchParams.set("step", step);
  }

  const query = nextSearchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
