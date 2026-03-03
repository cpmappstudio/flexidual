"use client"

import { useEffect, useMemo } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { BookOpen, Calendar, LayoutDashboard, Users, School } from "lucide-react"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useTranslations } from "next-intl"
import { getRoleForOrg } from "@/lib/rbac" 

export function NavMain() {
  const t = useTranslations()
  const pathname = usePathname()
  const params = useParams()
  
  // Extract context
  const orgSlug = params.orgSlug as string
  const { sessionClaims, isLoaded } = useAuth()

  // Evaluate role for THIS specific organization
  const role = useMemo(() => getRoleForOrg(sessionClaims, orgSlug), [sessionClaims, orgSlug])
  
  const isTeacher = role === "teacher" || role === "tutor"
  const isAdmin = role === "admin" || role === "principal" || role === "superadmin"

  if (!isLoaded || role === "student") return null

  // Base URL for all links in this tenant
  const basePath = `/${orgSlug}`

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('navigation.platform')}</SidebarGroupLabel>
      <SidebarMenu>
        
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname === basePath}>
            <Link href={basePath}>
              <LayoutDashboard />
              <span>{t('navigation.dashboard')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.includes(`${basePath}/calendar`)}>
            <Link href={`${basePath}/calendar`}>
              <Calendar />
              <span>{t('navigation.schedule')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {isTeacher && (
          <>
            <SidebarGroupLabel className="mt-4">{t('navigation.teaching')}</SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes(`${basePath}/classes`)}>
                <Link href={`${basePath}/classes`}>
                  <School />
                  <span>{isAdmin ? t('navigation.allClasses') : t('navigation.myClasses')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}

        {isAdmin && (
          <>
            <SidebarGroupLabel className="mt-4">{t('navigation.administration')}</SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes(`${basePath}/users`)}>
                <Link href={`${basePath}/users`}>
                  <Users />
                  <span>{t('navigation.allUsers')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes(`${basePath}/curriculums`)}>
                <Link href={`${basePath}/curriculums`}>
                  <BookOpen />
                  <span>{t('navigation.allCurriculums')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes(`${basePath}/classes`)}>
                <Link href={`${basePath}/classes`}>
                  <School />
                  <span>{t('navigation.allClasses')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}