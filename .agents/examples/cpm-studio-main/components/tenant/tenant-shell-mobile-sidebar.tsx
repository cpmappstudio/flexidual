"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { AppSidebarProps } from "@/components/app-sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

const MobileAppSidebar = dynamic(
  () => import("@/components/app-sidebar").then((mod) => mod.AppSidebar),
  { ssr: false },
) as ComponentType<AppSidebarProps>;

export function TenantShellMobileSidebar(props: AppSidebarProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return null;
  }

  return <MobileAppSidebar {...props} collapsible="offcanvas" />;
}
