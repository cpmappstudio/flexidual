"use client";

import type { Preloaded } from "convex/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { AppBrand } from "@/components/app-brand";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { isAbsoluteUrl } from "@/lib/navigation/utils";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArtificialIntelligence08Icon as ArtificialIntelligence08HugeIcon,
  HelpCircleIcon as HelpCircleHugeIcon,
} from "@hugeicons/core-free-icons";
import { Link, usePathname } from "@/i18n/navigation";
import { NavUser } from "@/components/nav-user";
import { ROUTES } from "@/lib/navigation/routes";

type SiteHeaderProps = {
  brandLabelMode?: "expanded" | "collapsed";
  appName: string;
  logoHref: string;
  navigation?: Array<{
    label: string;
    href: string;
  }>;
  preloadedCurrentUser: Preloaded<typeof api.users.current>;
  tenantSlug?: string;
  workspaceLink?: {
    href: string;
    label: string;
    detail?: string;
  };
  signOutRedirectHref: string;
  showSidebarTrigger?: boolean;
  useLogoAsMobileSidebarTrigger?: boolean;
  switcher?: ReactNode;
};

const EMPTY_NAVIGATION: NonNullable<SiteHeaderProps["navigation"]> = [];

function LogoMobileSidebarTrigger({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      className="flex items-center sm:hidden"
      aria-label={label}
      onClick={toggleSidebar}
    >
      {children}
    </button>
  );
}

export function SiteHeader({
  brandLabelMode = "expanded",
  appName,
  logoHref,
  navigation = EMPTY_NAVIGATION,
  preloadedCurrentUser,
  tenantSlug,
  workspaceLink,
  signOutRedirectHref,
  showSidebarTrigger = false,
  useLogoAsMobileSidebarTrigger = false,
  switcher,
}: SiteHeaderProps) {
  const pathname = usePathname();
  const t = useTranslations("Common");
  const hasNavigation = navigation.length > 0;
  const shouldCollapseBrandLabel = brandLabelMode === "collapsed";
  const activeNavigationHref = navigation.reduce<string | undefined>(
    (activeHref, item) => {
      if (
        isAbsoluteUrl(item.href) ||
        (pathname !== item.href && !pathname.startsWith(`${item.href}/`))
      ) {
        return activeHref;
      }

      return !activeHref || item.href.length > activeHref.length
        ? item.href
        : activeHref;
    },
    undefined,
  );

  function isActiveRoute(href: string) {
    return href === activeNavigationHref;
  }

  const headerActionTriggerClassName = cn(
    navigationMenuTriggerStyle(),
    "gap-1.5 rounded-full px-3 [&_svg]:size-3.5",
  );

  const logoContent = (
    <AppBrand
      appName={appName}
      labelMode={shouldCollapseBrandLabel ? "collapsed" : "expanded"}
    />
  );
  const logoLinkClassName = cn(
    "items-center",
    useLogoAsMobileSidebarTrigger ? "hidden sm:flex" : "flex",
  );
  const changelogHref = tenantSlug
    ? ROUTES.tenant.changelog(tenantSlug)
    : ROUTES.changelog;

  return (
    <header className="sticky top-0 z-50 flex w-full items-center border-b bg-background">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <div className="flex items-center gap-3">
          {showSidebarTrigger ? <SidebarTrigger /> : null}
          {useLogoAsMobileSidebarTrigger ? (
            <LogoMobileSidebarTrigger label={t("sidebar.openTooltip")}>
              {logoContent}
            </LogoMobileSidebarTrigger>
          ) : null}
          {isAbsoluteUrl(logoHref) ? (
            <a href={logoHref} className={logoLinkClassName}>
              {logoContent}
            </a>
          ) : (
            <Link href={logoHref} className={logoLinkClassName}>
              {logoContent}
            </Link>
          )}
        </div>
        {hasNavigation ? (
          <>
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            {switcher ? <div className="contents">{switcher}</div> : null}
            <NavigationMenu
              viewport={false}
              className="hidden sm:flex sm:flex-none sm:justify-start"
            >
              <NavigationMenuList className="justify-start sm:flex-none">
                {navigation.map((item) => (
                  <NavigationMenuItem key={item.href}>
                    <NavigationMenuLink
                      asChild
                      active={isActiveRoute(item.href)}
                    >
                      {isAbsoluteUrl(item.href) ? (
                        <a
                          href={item.href}
                          aria-current={
                            isActiveRoute(item.href) ? "page" : undefined
                          }
                          className={cn(
                            navigationMenuTriggerStyle(),
                            isActiveRoute(item.href) &&
                              "bg-muted text-foreground",
                          )}
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          aria-current={
                            isActiveRoute(item.href) ? "page" : undefined
                          }
                          className={cn(
                            navigationMenuTriggerStyle(),
                            isActiveRoute(item.href) &&
                              "bg-muted text-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      )}
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Link
              href={changelogHref}
              className={headerActionTriggerClassName}
              aria-label={t("changelog")}
              title={t("changelog")}
              aria-current={pathname === changelogHref ? "page" : undefined}
            >
              <HugeiconsIcon
                icon={ArtificialIntelligence08HugeIcon}
                strokeWidth={2}
                className="size-3.5"
                aria-hidden="true"
              />
              <span className="hidden lg:block">{t("changelog")}</span>
            </Link>
            <button
              type="button"
              className={headerActionTriggerClassName}
              disabled
              aria-label={t("support")}
              title={t("support")}
            >
              <HugeiconsIcon
                icon={HelpCircleHugeIcon}
                strokeWidth={2}
                className="size-3.5"
                aria-hidden="true"
              />
              <span className="hidden lg:block">{t("support")}</span>
            </button>
          </div>
          <NavUser
            preloadedCurrentUser={preloadedCurrentUser}
            tenantSlug={tenantSlug}
            workspaceLink={workspaceLink}
            signOutRedirectHref={signOutRedirectHref}
          />
        </div>
      </div>
    </header>
  );
}
