import {
  BuildingLibraryIcon,
  UsersIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  RectangleStackIcon,
} from "@heroicons/react/20/solid";
import { Palette } from "lucide-react";
import { ROUTES } from "@/lib/navigation/routes";
import type {
  NavItem,
  NavConfig,
  NavContext,
  NavIcon,
  SettingsNavItem,
  SettingsNavConfig,
} from "./types";

/**
 * Valid labelKey values for settings navigation items.
 * Used by the settings search to look up icons.
 */
export type SettingsLabelKey =
  | "general"
  | "appearance"
  | "profileSecurity"
  | "billing";

// =============================================================================
// Main Navigation Configuration
// =============================================================================

const ADMIN_ITEMS: NavItem[] = [
  {
    labelKey: "organizations",
    icon: BuildingLibraryIcon,
    href: () => ROUTES.admin.organizations.list,
    isIndex: false,
  },
];

const ORG_ITEMS: NavItem[] = [
  // {
  //   labelKey: "dashboard",
  //   icon: HomeIcon,
  //   href: (orgSlug) => ROUTES.org.root(orgSlug!),
  //   isIndex: true,
  // },
  {
    labelKey: "applications",
    icon: UsersIcon,
    href: (orgSlug) => ROUTES.org.applications.list(orgSlug!),
    isIndex: false,
  },
  // {
  //   labelKey: "teams",
  //   icon: UsersIcon,
  //   href: (orgSlug) => ROUTES.org.teams.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "divisions",
  //   icon: TrophyIcon,
  //   href: (orgSlug) => ROUTES.org.divisions.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "tournaments",
  //   icon: CalendarIcon,
  //   href: (orgSlug) => ROUTES.org.tournaments.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "offerings",
  //   icon: DocumentTextIcon,
  //   href: (orgSlug) => ROUTES.org.offerings.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "applications",
  //   icon: ClipboardDocumentListIcon,
  //   href: (orgSlug) => ROUTES.org.applications.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "members",
  //   icon: UserGroupIcon,
  //   href: (orgSlug) => ROUTES.org.members.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "fees",
  //   icon: CurrencyDollarIcon,
  //   href: (orgSlug) => ROUTES.org.fees.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "forms",
  //   icon: DocumentDuplicateIcon,
  //   href: (orgSlug) => ROUTES.org.forms.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "staff",
  //   icon: UsersIcon,
  //   href: (orgSlug) => ROUTES.org.staff.list(orgSlug!),
  //   isIndex: false,
  // },
  // {
  //   labelKey: "payments",
  //   icon: CreditCardIcon,
  //   href: (orgSlug) => ROUTES.org.payments(orgSlug!),
  //   isIndex: false,
  // },
];

const ORG_ADMIN_ITEMS: NavItem[] = [
  {
    labelKey: "programs",
    icon: RectangleStackIcon,
    href: (orgSlug) => ROUTES.org.programs.list(orgSlug!),
    isIndex: false,
  },
];

const NAV_CONFIGS: Record<NavContext, NavConfig> = {
  admin: {
    items: ADMIN_ITEMS,
    settingsHref: () => ROUTES.admin.settings.root,
  },
  org: {
    items: ORG_ITEMS,
    settingsHref: (orgSlug) => ROUTES.org.settings.root(orgSlug!),
  },
};

// =============================================================================
// Settings Navigation Configuration
// =============================================================================

const ADMIN_SETTINGS_ITEMS: SettingsNavItem[] = [
  {
    labelKey: "general",
    icon: Cog6ToothIcon,
    href: () => ROUTES.admin.settings.root,
    isIndex: true,
  },
  {
    labelKey: "profileSecurity",
    icon: ShieldCheckIcon,
    href: () => ROUTES.admin.settings.profileSecurity,
    isIndex: false,
  },
  // {
  //   labelKey: "billing",
  //   icon: CreditCardIcon,
  //   href: () => ROUTES.admin.settings.billing,
  //   isIndex: false,
  // },
  {
    labelKey: "appearance",
    icon: Palette,
    href: () => ROUTES.admin.settings.appearance,
    isIndex: false,
  },
];

const ORG_SETTINGS_ITEMS: SettingsNavItem[] = [
  {
    labelKey: "general",
    icon: Cog6ToothIcon,
    href: (orgSlug) => ROUTES.org.settings.root(orgSlug!),
    isIndex: true,
  },
  {
    labelKey: "profileSecurity",
    icon: ShieldCheckIcon,
    href: (orgSlug) => ROUTES.org.settings.profileSecurity(orgSlug!),
    isIndex: false,
  },
  // {
  //   labelKey: "billing",
  //   icon: CreditCardIcon,
  //   href: (orgSlug) => ROUTES.org.settings.billing(orgSlug!),
  //   isIndex: false,
  // },
  {
    labelKey: "appearance",
    icon: Palette,
    href: (orgSlug) => ROUTES.org.settings.appearance(orgSlug!),
    isIndex: false,
  },
];

const SETTINGS_NAV_CONFIGS: Record<NavContext, SettingsNavConfig> = {
  admin: {
    items: ADMIN_SETTINGS_ITEMS,
    basePath: () => ROUTES.admin.settings.root,
  },
  org: {
    items: ORG_SETTINGS_ITEMS,
    basePath: (orgSlug) => ROUTES.org.settings.root(orgSlug!),
  },
};

// =============================================================================
// Exported Functions
// =============================================================================

export function getNavConfig(
  context: NavContext,
  options?: { isTenantAdmin?: boolean },
): NavConfig {
  const config = NAV_CONFIGS[context];

  if (context !== "org") {
    return config;
  }

  return {
    ...config,
    items: options?.isTenantAdmin
      ? [...config.items, ...ORG_ADMIN_ITEMS]
      : config.items,
  };
}

export function getSettingsNavConfig(context: NavContext): SettingsNavConfig {
  return SETTINGS_NAV_CONFIGS[context];
}

export function isItemActive(
  pathname: string,
  href: string,
  isIndex: boolean = false,
): boolean {
  if (isIndex) {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname.startsWith(href);
}

export function getNavContext(
  pathname: string,
  orgSlug: string | null,
): NavContext {
  if (pathname.startsWith("/admin")) {
    return "admin";
  }
  if (orgSlug) {
    return "org";
  }
  return "admin";
}

/**
 * Get the icon component for a settings item by its labelKey.
 * Uses admin settings as the source of truth (icons are the same for both contexts).
 */
export function getSettingsIcon(labelKey: SettingsLabelKey): NavIcon {
  const item = ADMIN_SETTINGS_ITEMS.find((item) => item.labelKey === labelKey);
  return item?.icon ?? Cog6ToothIcon;
}
