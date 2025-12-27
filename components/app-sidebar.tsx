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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar()
  const collapsed = state === "collapsed";
  return (
    <Sidebar 
      collapsible="icon" 
      className="overflow-hidden data-[state=expanded | collapsed]:overflow-hidden"
      {...props}
    >
      {/* 1. Header: User Profile */}
      <SidebarHeader>
        <FlexidualLogo size={collapsed ? "sm" : "md"} className={collapsed ? "justify-center" : ""} stacked={collapsed} />
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