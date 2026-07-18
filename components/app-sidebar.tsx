"use client"

import * as React from "react"
import Image from "next/image"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

import { OrgSwitcher } from "./org-switcher"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]! overflow-hidden"
      {...props}
    >
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>
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
  )
}