import type { ForwardRefExoticComponent, SVGProps } from "react";
import type { LucideIcon } from "lucide-react";

export type HeroIcon = ForwardRefExoticComponent<SVGProps<SVGSVGElement>>;

/**
 * Icon type that supports both Heroicons and Lucide icons.
 */
export type NavIcon = HeroIcon | LucideIcon;

/**
 * Navigation item configuration.
 *
 * @property labelKey - Translation key for the item label
 * @property icon - Heroicon component to display
 * @property href - Function that returns the full path (receives orgSlug for org context)
 * @property isIndex - Whether this is the index/dashboard route (affects active state matching)
 */
export type NavItem = {
  labelKey: string;
  icon: HeroIcon;
  href: (orgSlug?: string) => string;
  isIndex: boolean;
};

export type NavContext = "admin" | "org";

export type NavConfig = {
  items: NavItem[];
  settingsHref: (orgSlug?: string) => string;
};

/**
 * Settings navigation item configuration.
 *
 * @property labelKey - Translation key for the item label (uses Settings.nav namespace)
 * @property icon - Icon component to display (Heroicon or Lucide)
 * @property href - Function that returns the full path (receives orgSlug for org context)
 * @property isIndex - Whether this is the root settings page (affects active state matching)
 */
export type SettingsNavItem = {
  labelKey: string;
  icon: NavIcon;
  href: (orgSlug?: string) => string;
  isIndex: boolean;
};

/**
 * Settings navigation configuration per context.
 */
export type SettingsNavConfig = {
  items: SettingsNavItem[];
  basePath: (orgSlug?: string) => string;
};
