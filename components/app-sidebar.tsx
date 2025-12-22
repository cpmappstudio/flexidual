"use client"

import * as React from "react"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ModeToggle } from "./mode-toggle"
import { LangToggle } from "./lang-toggle"
import { UserButtonWrapper } from "./user-button-wrapper"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      {/* 1. Header: User Profile */}
      <SidebarHeader>
        <UserButtonWrapper />
      </SidebarHeader>

      {/* 2. Content: The Main Menu (Logic is inside NavMain now) */}
      <SidebarContent>
        <NavMain />
      </SidebarContent>

      {/* 3. Footer: Theme & Language Toggles */}
      <SidebarFooter>
        <div className="flex items-center justify-between p-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <ModeToggle />
          <LangToggle />
        </div>
      </SidebarFooter>
      
      <SidebarRail />
    </Sidebar>
  )
}