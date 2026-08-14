"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavMain } from "@/components/nav-main";
import { SidebarEdgeTrigger } from "@/components/sidebar-edge-trigger";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

import { OrgSwitcher } from "./org-switcher";
import { useCurrentOrgRole } from "@/hooks/use-current-org-role";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const { isMobile, open, setOpenMobile, toggleSidebar } = useSidebar();
  const { role } = useCurrentOrgRole();

  React.useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, pathname, setOpenMobile]);

  const isStudent = role === "student";
  const toggleLabel = open ? t("collapseNavigation") : t("expandNavigation");

  return (
    <Sidebar
      collapsible="icon"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      {!isStudent && (
        <>
          <SidebarHeader>
            <OrgSwitcher />
          </SidebarHeader>
          <SidebarSeparator className="mx-0" />
        </>
      )}
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter className="gap-0 overflow-hidden p-0">
        <div className="relative h-48 w-full overflow-hidden group-data-[collapsible=icon]:hidden">
          <Image
            src="/sidebar-footer-decoration.svg"
            alt=""
            width={2055}
            height={1064}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-1/2 h-auto w-[150%] max-w-none -translate-x-1/2 select-none"
          />
        </div>
      </SidebarFooter>
      <SidebarEdgeTrigger
        direction="collapse"
        aria-label={t("closeNavigation")}
        title={t("closeNavigation")}
        aria-expanded="true"
        onClick={() => setOpenMobile(false)}
        className="absolute top-4 -right-[14px] z-[60] md:hidden"
      />
      <SidebarRail
        aria-label={toggleLabel}
        title={toggleLabel}
        tabIndex={0}
        onClick={toggleSidebar}
        className="group/rail inset-y-0! right-[-0.375rem]! hidden! w-3! translate-x-0! cursor-pointer! border-0 bg-transparent p-0 after:left-1/2! after:right-auto! after:w-px after:bg-sidebar-border hover:after:bg-primary focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none md:flex!"
      >
        <span className="absolute top-4 left-1/2 flex h-7 w-[14px] items-center justify-center rounded-r-md border border-l-0 border-primary bg-primary opacity-100 shadow-sm transition-opacity lg:opacity-0 lg:group-hover/rail:opacity-100 lg:group-focus-visible/rail:opacity-100">
          <Image
            src={open ? "/sidebar-collapse.svg" : "/sidebar-expand.svg"}
            alt=""
            width={24}
            height={24}
            aria-hidden="true"
            className="size-3 shrink-0"
          />
        </span>
      </SidebarRail>
    </Sidebar>
  );
}
