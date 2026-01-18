"use client"

import { useEffect } from "react"
import {
  BookOpen,
  Calendar,
  LayoutDashboard,
  Users,
  // GraduationCap,
  School,
  LibraryBig,
} from "lucide-react"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useCurrentUser } from "@/hooks/use-current-user"
import { useTranslations } from "next-intl"

export function NavMain() {
  // Call ALL hooks unconditionally at the top
  const { user, isLoading } = useCurrentUser()
  const t = useTranslations()
  const pathname = usePathname()
  const router = useRouter()

  // Role helpers
  const isTeacher = user?.role === "teacher"
  const isAdmin = user?.role === "admin" || user?.role === "superadmin"

  // Redirect effect
  useEffect(() => {
    if (!user) return
    
    const isDashboardRoute = 
      pathname.includes("/teaching") || 
      pathname.includes("/admin") ||
      pathname.includes("/calendar")

    if (isDashboardRoute && !(isTeacher || isAdmin)) {
      router.replace("/")
    }
  }, [pathname, router, isTeacher, isAdmin, user])

  // Conditional rendering AFTER all hooks
  if (isLoading) return null
  if (user?.role === "student") return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('navigation.platform')}</SidebarGroupLabel>
      <SidebarMenu>
        
        {/* 1. DASHBOARD (Everyone) */}
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.endsWith("/")}>
            <Link href="/">
              <LayoutDashboard />
              <span>{t('navigation.dashboard')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {/* 2. CALENDAR (Everyone - The Core Feature) */}
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.includes("/calendar")}>
            <Link href="/calendar">
              <Calendar />
              <span>{t('navigation.schedule')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {/* 3. TEACHING TOOLS (Teachers/Admins) */}
        {isTeacher && (
          <>
            <SidebarGroupLabel className="mt-4">{t('navigation.teaching')}</SidebarGroupLabel>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/teaching/curriculums")}>
                <Link href="/teaching/curriculums">
                  <BookOpen />
                  <span>{t('navigation.curriculums')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/teaching/classes")}>
                <Link href="/teaching/classes">
                  <School />
                  <span>{isAdmin ? t('navigation.allClasses') : t('navigation.myClasses')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}

        {/* 4. ADMIN TOOLS (Admins Only) */}
        {isAdmin && (
          <>
            <SidebarGroupLabel className="mt-4">{t('navigation.administration')}</SidebarGroupLabel>
            
            {/* <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/teachers")}>
                <Link href="/admin/teachers">
                  <Users />
                  <span>{t('navigation.teachers')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/students")}>
                <Link href="/admin/students">
                  <GraduationCap />
                  <span>{t('navigation.students')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem> */}

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/users")}>
                <Link href="/admin/users">
                  <Users />
                  <span>{t('navigation.allUsers')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/lessons")}>
                <Link href="/admin/lessons">
                  <LibraryBig />
                  <span>{t('navigation.allLessons')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/admin/curriculums")}>
                <Link href="/admin/curriculums">
                  <BookOpen />
                  <span>{t('navigation.allCurriculums')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes("/teaching/classes")}>
                <Link href="/teaching/classes">
                  <School />
                  <span>{isAdmin ? t('navigation.allClasses') : t('navigation.myClasses')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}

      </SidebarMenu>
    </SidebarGroup>
  )
}