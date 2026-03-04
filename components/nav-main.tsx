"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
// ADDED Building2 and MapPin for the new Superadmin links
import { BookOpen, Calendar, LayoutDashboard, Users, School, Building2, MapPin } from "lucide-react"
import { Link, usePathname } from "@/i18n/navigation"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useTranslations } from "next-intl"
import { getRoleForOrg } from "@/lib/rbac" 

export function NavMain() {
  const t = useTranslations()
  const pathname = usePathname()
  const params = useParams()
  
  // 1. Extract context AND normalize the URL
  let currentSlug = params.orgSlug as string
  if (currentSlug === "admin" || pathname.startsWith("/admin")) {
    currentSlug = "system"
  }

  const { sessionClaims, isLoaded } = useAuth()

  // 2. Evaluate role for THIS specific context
  const role = useMemo(() => getRoleForOrg(sessionClaims, currentSlug), [sessionClaims, currentSlug])
  
  const isTeacher = role === "teacher" || role === "tutor"
  const isAdmin = role === "admin" || role === "principal" || role === "superadmin"
  const isGlobalSystem = currentSlug === "system"

  if (!isLoaded || role === "student") return null

  // Base URL for all links in this tenant
  const basePath = isGlobalSystem ? "/admin" : `/${currentSlug}`

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

        {/* Global Superadmin Exclusive Links */}
        {isGlobalSystem && role === "superadmin" && (
          <>
            <SidebarGroupLabel className="mt-4">Network</SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes(`/admin/schools`)}>
                <Link href={`/admin/schools`}>
                  <Building2 />
                  <span>Schools</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname.includes(`/admin/campuses`)}>
                <Link href={`/admin/campuses`}>
                  <MapPin />
                  <span>Campuses</span>
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