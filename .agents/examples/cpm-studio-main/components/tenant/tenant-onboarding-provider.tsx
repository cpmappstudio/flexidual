"use client";

import {
  createContext,
  use,
  useState,
  type ReactNode,
} from "react";
import type { TenantOnboardingServiceKey } from "@/lib/tenancy/services";

type TenantOnboardingContextValue = {
  selectedServices: TenantOnboardingServiceKey[];
  toggleService: (serviceKey: TenantOnboardingServiceKey) => void;
  canAccessInviteTeammates: boolean;
};

const TenantOnboardingContext =
  createContext<TenantOnboardingContextValue | null>(null);

const EMPTY_SELECTED_SERVICES: TenantOnboardingServiceKey[] = [];

export function TenantOnboardingProvider({
  children,
  initialSelectedServices = EMPTY_SELECTED_SERVICES,
}: {
  children: ReactNode;
  initialSelectedServices?: TenantOnboardingServiceKey[];
}) {
  const [selectedServices, setSelectedServices] = useState<
    TenantOnboardingServiceKey[]
  >(() => [...initialSelectedServices]);

  function toggleService(serviceKey: TenantOnboardingServiceKey) {
    setSelectedServices((currentServices) =>
      currentServices.includes(serviceKey)
        ? currentServices.filter((currentKey) => currentKey !== serviceKey)
        : [...currentServices, serviceKey],
    );
  }

  return (
    <TenantOnboardingContext.Provider
      value={{
        selectedServices,
        toggleService,
        canAccessInviteTeammates: selectedServices.length > 0,
      }}
    >
      {children}
    </TenantOnboardingContext.Provider>
  );
}

export function useTenantOnboarding() {
  const context = use(TenantOnboardingContext);

  if (!context) {
    throw new Error(
      "useTenantOnboarding must be used within TenantOnboardingProvider",
    );
  }

  return context;
}
