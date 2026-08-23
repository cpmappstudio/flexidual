"use client";

import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/account-menu";
import { SystemNotificationCenter } from "@/components/notifications/system-notification-center";
import { SidebarEdgeTrigger } from "@/components/sidebar-edge-trigger";
import { FlexidualLogo } from "@/components/ui/flexidual-logo";
import { useSidebar } from "@/components/ui/sidebar";
import { useCurrentOrgRole } from "@/hooks/use-current-org-role";

export function SiteHeader() {
  const t = useTranslations("brand.roleView");
  const navigationT = useTranslations("navigation");
  const { openMobile, setOpenMobile } = useSidebar();
  const { role } = useCurrentOrgRole();
  const subtitle =
    role === "superadmin" ||
    role === "admin" ||
    role === "principal" ||
    role === "teacher" ||
    role === "tutor" ||
    role === "student"
      ? t(role)
      : undefined;

  return (
    <header className="sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center border-b border-primary bg-primary">
      <div className="flex w-full min-w-0 items-center px-3 sm:px-5">
        <FlexidualLogo
          inverted
          priority
          className="h-10 shrink-0 sm:h-12"
          subtitle={subtitle}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SystemNotificationCenter />
          <div className="flex size-8 items-center justify-center rounded-full bg-sidebar ring-1 ring-sidebar-border">
            <AccountMenu className="hover:bg-sidebar-accent" />
          </div>
        </div>
      </div>
      {!openMobile && (
        <SidebarEdgeTrigger
          direction="expand"
          aria-label={navigationT("openNavigation")}
          title={navigationT("openNavigation")}
          aria-expanded="false"
          onClick={() => setOpenMobile(true)}
          className="absolute top-[calc(100%+1rem)] left-0 md:hidden"
        />
      )}
    </header>
  );
}
