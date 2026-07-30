"use client";

import * as React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NavMain } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

import { OrgSwitcher } from "./org-switcher";
import { useCurrentOrgRole } from "@/hooks/use-current-org-role";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { role } = useCurrentOrgRole();

  React.useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, pathname, setOpenMobile]);

  const isStudent = role === "student";

  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! overflow-hidden"
      {...props}
    >
      {!isStudent && (
        <SidebarHeader>
          <OrgSwitcher />
        </SidebarHeader>
      )}
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter className="gap-0 overflow-hidden p-0">
        <div className="relative h-48 w-full overflow-hidden">
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
    </Sidebar>
  );
}
