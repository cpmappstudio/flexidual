"use client"

import {
  BookOpen,
  Calendar,
  LayoutDashboard,
  Settings2,
  Users,
  Video,
} from "lucide-react"
import { Link, usePathname } from "@/i18n/navigation"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useCurrentUser } from "@/hooks/use-current-user"

export function NavMain() {
  const pathname = usePathname()
  const { user, isLoading } = useCurrentUser()

  if (isLoading) return null

  // Role helpers
  const isTeacher = user?.role === "teacher" || user?.role === "admin" || user?.role === "superadmin"
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        
        {/* 1. DASHBOARD (Everyone) */}
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.endsWith("/")}>
            <Link href="/">
              <LayoutDashboard />
              <span>Dashboard</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {/* 2. CALENDAR (Everyone - The Core Feature) */}
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.includes("/calendar")}>
            <Link href="/calendar">
              <Calendar />
              <span>Schedule</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {/* 3. TEACHING TOOLS (Teachers/Admins) */}
        {isTeacher && (
          <>
            <SidebarGroupLabel className="mt-4">Teaching</SidebarGroupLabel>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/teaching/my-curriculums")}>
                <Link href="/teaching/my-curriculums">
                  <BookOpen />
                  <span>Curriculums</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            {/* We will build this page next: Managing Active Classes */}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/teaching/classes")}>
                <Link href="/teaching/classes">
                  <Users />
                  <span>My Classes</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}

        {/* 4. ADMIN TOOLS (Admins Only) */}
        {isAdmin && (
          <>
            <SidebarGroupLabel className="mt-4">Administration</SidebarGroupLabel>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/users")}>
                <Link href="/admin/users">
                  <Users />
                  <span>Users & Roles</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/curriculums")}>
                <Link href="/admin/curriculums">
                  <BookOpen />
                  <span>All Curriculums</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}

      </SidebarMenu>
    </SidebarGroup>
  )
}