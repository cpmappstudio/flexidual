"use client"

import { useMemo } from "react"
import Image from "next/image"
import { useParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
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
          <SidebarMenuButton
            asChild
            isActive={pathname === basePath}
            className="h-12 gap-3 px-2 text-base"
          >
            <Link href={basePath}>
              <Image src="/home-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
              <span>{t('navigation.dashboard')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {(isTeacher || isAdmin) && (
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.includes(`${basePath}/classes`)}
              className="h-12 gap-3 px-2 text-base"
            >
              <Link href={`${basePath}/classes`}>
                <Image src="/classes-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
                <span>{isAdmin ? t('navigation.allClasses') : t('navigation.myClasses')}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}

        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname.includes(`${basePath}/calendar`)}
            className="h-12 gap-3 px-2 text-base"
          >
            <Link href={`${basePath}/calendar`}>
              <Image src="/calendar-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
              <span>{t('navigation.calendar')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>


        {isAdmin && (
          <>
            <SidebarGroupLabel className="mt-4">{t('navigation.administration')}</SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/users`)}
                className="h-12 gap-3 px-2 text-base"
              >
                <Link href={`${basePath}/users`}>
                  <Image src="/messages-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
                  <span>{t('navigation.allUsers')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/curriculums`)}
                className="h-12 gap-3 px-2 text-base"
              >
                <Link href={`${basePath}/curriculums`}>
                  <Image src="/resources-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
                  <span>{t('navigation.allCurriculums')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}