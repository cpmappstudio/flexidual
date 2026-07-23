"use client"

import { useMemo } from "react"
import Image from "next/image"
import { useAuth } from "@clerk/nextjs"
import { Link, usePathname } from "@/i18n/navigation"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useTranslations } from "next-intl"
import { getHighestStaffRole } from "@/lib/rbac"
import { useStaffAccess } from "@/hooks/use-staff-access"
import { useOrgBasePath } from "@/hooks/use-org-base-path"

export function NavMain() {
  const t = useTranslations()
  const pathname = usePathname()
  const { sessionClaims, isLoaded } = useAuth()
  const { access } = useStaffAccess()
  const basePath = useOrgBasePath()
  const fallbackRole = useMemo(
    () => getHighestStaffRole(sessionClaims),
    [sessionClaims],
  )
  const role = access?.role ?? fallbackRole
  const canViewPeople =
    access?.canViewPeople ??
    (role === "admin" || role === "principal" || role === "superadmin")

  if (!isLoaded || role === "student") return null

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

        {role && (
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.includes(`${basePath}/classes`)}
              className="h-12 gap-3 px-2 text-base"
            >
              <Link href={`${basePath}/classes`}>
                <Image src="/classes-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
                <span>{t('navigation.allClasses')}</span>
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


        {canViewPeople && (
          <>
            <SidebarGroupLabel className="mt-4">{t('navigation.administration')}</SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/students`)}
                className="h-12 gap-3 px-2 text-base"
              >
                <Link href={`${basePath}/students`}>
                  <Image src="/students-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
                  <span>{t('navigation.students')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/professors`)}
                className="h-12 gap-3 px-2 text-base"
              >
                <Link href={`${basePath}/professors`}>
                  <Image src="/professors-icon.svg" alt="" width={32} height={32} aria-hidden="true" />
                  <span>{t('navigation.teachers')}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
