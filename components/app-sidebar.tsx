"use client"

import * as React from "react"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar
} from "@/components/ui/sidebar"
import { ModeToggle } from "./mode-toggle"
import { LangToggle } from "./lang-toggle"
import { UserButtonWrapper } from "./user-button-wrapper"
import { FlexidualLogo } from "./ui/flexidual-logo"
import { OrgSwitcher } from "./org-switcher"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state, openMobile } = useSidebar()
  const collapsed = state === "collapsed";
  return (
    <Sidebar 
      collapsible="icon" 
      className="overflow-hidden data-[state=expanded | collapsed]:overflow-hidden"
      {...props}
    >
      {/* 1. Header: User Profile */}
      <SidebarHeader className="flex items-center justify-center pt-6">
        <FlexidualLogo stacked={collapsed || (openMobile && collapsed)} />
        <OrgSwitcher />
      </SidebarHeader>

      {/* 2. Content: The Main Menu (Logic is inside NavMain now) */}
      <SidebarContent>
        <NavMain />
      </SidebarContent>

      {/* 3. Footer: Theme & Language Toggles */}
      <SidebarFooter>
          <ModeToggle showText={!collapsed}/>
          <LangToggle showText={!collapsed}/>
          <UserButtonWrapper showName={!collapsed} collapsed={collapsed} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}