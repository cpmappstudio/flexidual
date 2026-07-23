"use client";

import * as React from "react";
import { AppBrand } from "@/components/app-brand";
import { NavMain } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "@/i18n/navigation";
import { isAbsoluteUrl } from "@/lib/navigation/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeftDoubleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export type AppSidebarItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  isActive?: boolean;
  items?: {
    title: string;
    url: string;
  }[];
};

export type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  items: AppSidebarItem[];
  groupLabel: string;
  brand?: {
    appName: string;
    href: string;
  };
  collapseLabel: string;
  collapseTooltip: string;
  expandLabel: string;
  expandTooltip: string;
};

export function AppSidebar({
  items,
  groupLabel,
  brand,
  collapseLabel,
  collapseTooltip,
  expandLabel,
  expandTooltip,
  className,
  ...props
}: AppSidebarProps) {
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const closeMobileSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "top-(--header-height) h-[calc(100svh-var(--header-height))]!",
        className,
      )}
      {...props}
    >
      {brand ? (
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                tooltip={brand.appName}
                className="px-2"
              >
                {isAbsoluteUrl(brand.href) ? (
                  <a href={brand.href} onClick={closeMobileSidebar}>
                    <AppBrand appName={brand.appName} />
                  </a>
                ) : (
                  <Link href={brand.href} onClick={closeMobileSidebar}>
                    <AppBrand appName={brand.appName} />
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
      ) : null}
      <SidebarContent>
        <NavMain groupLabel={groupLabel} items={items} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              onClick={toggleSidebar}
              tooltip={isCollapsed ? expandTooltip : collapseTooltip}
            >
              <HugeiconsIcon
                icon={ArrowLeftDoubleIcon}
                strokeWidth={2}
                className={isCollapsed ? "size-4 rotate-180" : "size-4"}
                aria-hidden="true"
              />
              <span>{isCollapsed ? expandLabel : collapseLabel}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
