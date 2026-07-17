"use client";

import { useParams } from "next/navigation";
import { usePathname } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { Navbar, NavbarSection, NavbarSpacer } from "@/components/ui/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from "@/components/ui/sidebar";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Cog6ToothIcon } from "@heroicons/react/20/solid";
import { getNavConfig, getNavContext, isItemActive } from "@/lib/navigation";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/navigation/routes";
import { routing } from "@/i18n/routing";
import { isSingleTenantMode } from "@/lib/tenancy/config";
import Image from "next/image";

const SINGLE_TENANT_MODE = isSingleTenantMode();

function getLocalePrefix(locale: string): string {
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}

function withLocalePrefix(locale: string, path: string): string {
  return `${getLocalePrefix(locale)}${path}`;
}

function getTenantSignInUrl(locale: string, orgSlug: string | null): string {
  if (orgSlug) {
    return withLocalePrefix(locale, ROUTES.tenant.auth.signIn(orgSlug));
  }
  return withLocalePrefix(locale, ROUTES.auth.signIn);
}

export function NavbarAppSidebar() {
  const params = useParams();
  const locale = useLocale();
  const orgSlug = (params.tenant as string) || null;
  const userProfileUrl = orgSlug
    ? withLocalePrefix(locale, ROUTES.org.settings.profileSecurity(orgSlug))
    : withLocalePrefix(locale, ROUTES.auth.organizations);
  const afterSignOutUrl = getTenantSignInUrl(locale, orgSlug);

  return (
    <Navbar>
      <NavbarSpacer />
      <NavbarSection>
        <UserButton
          userProfileUrl={userProfileUrl}
          afterSignOutUrl={afterSignOutUrl}
        />
      </NavbarSection>
    </Navbar>
  );
}

interface SidebarAppSidebarProps {
  isTenantAdmin?: boolean;
}

export function SidebarAppSidebar({
  isTenantAdmin = false,
}: SidebarAppSidebarProps) {
  const params = useParams();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Navigation.nav");

  const orgSlug = (params.tenant as string) || null;

  const afterSelectOrgUrl = withLocalePrefix(
    locale,
    ROUTES.org.applications.list(":slug"),
  );
  const organizationsUrl = withLocalePrefix(locale, ROUTES.auth.organizations);
  const afterSignOutUrl = getTenantSignInUrl(locale, orgSlug);
  const organizationProfileUrl = orgSlug
    ? withLocalePrefix(locale, ROUTES.org.settings.root(orgSlug))
    : organizationsUrl;
  const userProfileUrl = orgSlug
    ? withLocalePrefix(locale, ROUTES.org.settings.profileSecurity(orgSlug))
    : organizationsUrl;

  const context = getNavContext(pathname, orgSlug);
  const { items, settingsHref } = getNavConfig(context, {
    isTenantAdmin,
  });

  return (
    <Sidebar>
      <SidebarHeader>
        {SINGLE_TENANT_MODE ? (
          <div className="w-full rounded-md px-3 py-2 flex items-center justify-center">
            <Image
              src={"/cpca-logo-v2.png"}
              width={150}
              height={100}
              alt={t("organizationLogoAlt")}
            />
          </div>
        ) : (
          <OrganizationSwitcher
            organizationProfileUrl={organizationProfileUrl}
            afterLeaveOrganizationUrl={organizationsUrl}
            afterSelectOrganizationUrl={afterSelectOrgUrl}
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger: "w-full justify-between text-left",
                organizationPreviewMainIdentifier:
                  "text-sidebar-foreground text-lg font-semibold",
                organizationPreviewSecondaryIdentifier:
                  "text-sidebar-foreground/70",
                organizationSwitcherTriggerIcon: "text-sidebar-foreground",
                organizationSwitcherPopoverCard: "bg-popover",
                organizationSwitcherPopoverActionButton: "hover:bg-accent",
                organizationSwitcherPopoverActionButtonText: "text-foreground",
              },
            }}
          />
        )}
      </SidebarHeader>

      <SidebarBody>
        <SidebarSection>
          {items.map((item) => {
            const href = item.href(orgSlug ?? undefined);
            const isCurrent = isItemActive(pathname, href, item.isIndex);

            return (
              <SidebarItem key={item.labelKey} href={href} current={isCurrent}>
                <item.icon data-slot="icon" />
                <SidebarLabel>{t(item.labelKey)}</SidebarLabel>
              </SidebarItem>
            );
          })}
        </SidebarSection>

        <SidebarSpacer />

        <SidebarSection>
          <SidebarItem
            href={settingsHref(orgSlug ?? undefined)}
            current={isItemActive(
              pathname,
              settingsHref(orgSlug ?? undefined),
              false,
            )}
          >
            <Cog6ToothIcon data-slot="icon" />
            <SidebarLabel>{t("settings")}</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarBody>

      <SidebarFooter className="max-lg:hidden">
        <UserButton
          userProfileUrl={userProfileUrl}
          afterSignOutUrl={afterSignOutUrl}
          appearance={{
            elements: {
              userButtonBox: {
                flexDirection: "row-reverse",
                textAlign: "left",
                maxWidth: "100%",
              },
              userButtonOuterIdentifier: "text-sidebar-foreground",
              userButtonTrigger: "text-sidebar-foreground",
            },
          }}
          showName
        />
      </SidebarFooter>
    </Sidebar>
  );
}
