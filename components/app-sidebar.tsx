"use client";

import * as React from "react";
import Image from "next/image";
import { useAuth } from "@clerk/nextjs";
import { useParams, usePathname } from "next/navigation";
import { NavMain } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

import { OrgSwitcher } from "./org-switcher";
import { getRoleForOrg } from "@/lib/rbac";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const params = useParams();
  const pathname = usePathname();
  const { sessionClaims } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();

  React.useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, pathname, setOpenMobile]);

  let currentSlug = params.orgSlug as string | undefined;
  if (currentSlug === "admin" || pathname.startsWith("/admin")) {
    currentSlug = "system";
  }

  const role = getRoleForOrg(sessionClaims, currentSlug ?? "system");
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
