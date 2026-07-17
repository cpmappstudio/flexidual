"use client";

import Link from "next/link";
import { usePathname } from "@/i18n/navigation";
import { UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/ui/logo";
import {
  Navbar,
  NavbarDivider,
  NavbarSection,
  NavbarItem,
  NavbarSpacer,
} from "@/components/ui/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "@/components/ui/sidebar";
import { getNavConfig, isItemActive } from "@/lib/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { useTranslations } from "next-intl";

{
  /* MOBILE VIEW */
}
export function SidebarAdminNavbar() {
  const t = useTranslations("Navigation.nav");
  const pathname = usePathname();

  const { items, settingsHref } = getNavConfig("admin");

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href={ROUTES.admin.root} aria-label="Home">
          <Logo className="h-10 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          {items.map((item) => {
            const href = item.href();
            const isCurrent = isItemActive(pathname, href, item.isIndex);

            return (
              <SidebarItem key={item.labelKey} href={href} current={isCurrent}>
                <item.icon data-slot="icon" />
                <SidebarLabel>{t(item.labelKey)}</SidebarLabel>
              </SidebarItem>
            );
          })}
        </SidebarSection>

        <SidebarSection>
          <SidebarItem
            href={settingsHref()}
            current={isItemActive(pathname, settingsHref(), false)}
          >
            <SidebarLabel>{t("settings")}</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarBody>
    </Sidebar>
  );
}

{
  /* DESKTOP VIEW */
}
export function NavbarAdminNavbar() {
  const t = useTranslations("Navigation.nav");
  const pathname = usePathname();

  const { items, settingsHref } = getNavConfig("admin");

  return (
    <Navbar className="flex flex-row-reverse lg:flex-row">
      <Link href={ROUTES.admin.root} aria-label="Home">
        <Logo className="h-8 w-auto" />
      </Link>
      <NavbarDivider className="max-lg:hidden" />
      <NavbarSection className="max-lg:hidden">
        {items.map((item) => {
          const href = item.href();
          const isCurrent = isItemActive(pathname, href, item.isIndex);

          return (
            <NavbarItem key={item.labelKey} href={href} current={isCurrent}>
              {t(item.labelKey)}
            </NavbarItem>
          );
        })}
        <NavbarItem
          href={settingsHref()}
          current={isItemActive(pathname, settingsHref(), false)}
        >
          {t("settings")}
        </NavbarItem>
      </NavbarSection>
      <NavbarSpacer />
      <NavbarSection>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "size-8",
            },
          }}
        />
      </NavbarSection>
    </Navbar>
  );
}
