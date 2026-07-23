import type { ReactNode } from "react";
import { redirect as nextRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams, TenantParams } from "@/i18n/params";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import {
  isModuleEnabled,
  isModuleImplemented,
  moduleManifestRegistry,
  supportsModuleSurface,
} from "@/lib/modules/registry";
import type { ModuleManifest } from "@/lib/modules/types";
import { getRootHostUrl } from "@/lib/tenancy/domain";

type TenantModuleLayoutProps = {
  children: ReactNode;
  params: TenantParams;
};

type CampusModuleLayoutProps = {
  children: ReactNode;
  params: TenantCampusParams;
};

export function createTenantModuleGuardLayout(manifest: ModuleManifest) {
  return async function TenantModuleLayout({
    children,
    params,
  }: TenantModuleLayoutProps) {
    const { locale: requestedLocale, tenant } = await params;
    const locale = requireLocale(requestedLocale);
    setRequestLocale(locale);

    const workspace = await getCurrentTenantWorkspace(tenant);
    if (!workspace) {
      nextRedirect(getRootHostUrl(locale));
    }

    if (
      !isModuleImplemented(manifest) ||
      !supportsModuleSurface(manifest, "tenant") ||
      !isModuleEnabled(manifest, workspace.enabledCapabilityKeys)
    ) {
      nextRedirect(ROUTES.tenant.root(tenant));
    }

    return children;
  };
}

export function createCampusModuleGuardLayout(manifest: ModuleManifest) {
  return async function CampusModuleLayout({
    children,
    params,
  }: CampusModuleLayoutProps) {
    const { locale: requestedLocale, tenant } = await params;
    const locale = requireLocale(requestedLocale);
    setRequestLocale(locale);

    const workspace = await getCurrentTenantWorkspace(tenant);
    if (!workspace) {
      nextRedirect(getRootHostUrl(locale));
    }

    if (
      !isModuleImplemented(manifest) ||
      !supportsModuleSurface(manifest, "campus") ||
      !isModuleEnabled(manifest, workspace.enabledCapabilityKeys)
    ) {
      nextRedirect(ROUTES.tenant.root(tenant));
    }

    return children;
  };
}

export function getModuleManifestOrThrow(moduleKey: keyof typeof moduleManifestRegistry) {
  return moduleManifestRegistry[moduleKey];
}
