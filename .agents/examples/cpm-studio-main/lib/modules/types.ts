import type {
  PlatformCapabilityKey,
  PlatformModuleKey,
} from "@/lib/platform/capabilities";
import type { IconSvgElement } from "@hugeicons/react";

export type TenantEffectiveRole = "owner" | "admin" | "member";
export type ModuleSurface = "tenant" | "campus";
export type ModuleStatus = "planned" | "implemented";

export type ModuleNavigationItem = {
  label: string;
  href: string;
  icon?: IconSvgElement;
  items?: readonly {
    label: string;
    href: string;
  }[];
};

export type ModuleNavigationContext = {
  tenantSlug: string;
  campusSlug?: string;
  enabledCapabilityKeys: readonly PlatformCapabilityKey[];
  effectiveRole: TenantEffectiveRole;
  isPlatformAdmin: boolean;
  getModuleLabel: (moduleKey: PlatformModuleKey) => string;
  getModuleNavigationLabel: (
    moduleKey: PlatformModuleKey,
    itemKey: string,
  ) => string;
};

export type ModuleManifest = {
  key: PlatformModuleKey;
  status: ModuleStatus;
  surfaces: readonly ModuleSurface[];
  routePrefix: string;
  icon: IconSvgElement;
  iconColor: string;
  // At least one of these capabilities must be enabled for the module root to
  // be considered available in a tenant workspace.
  requiredCapabilities: readonly PlatformCapabilityKey[];
  navigation: (
    ctx: ModuleNavigationContext,
    surface: ModuleSurface,
  ) => readonly ModuleNavigationItem[];
};
