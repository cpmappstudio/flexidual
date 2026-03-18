"use client"

import * as React from "react"
import { ChevronsUpDown, Building2, Shield, School } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { useParams, usePathname } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { getRolesFromClaims } from "@/lib/rbac"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { useAdminSchoolFilter } from "@/components/providers/admin-school-filter-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useTranslations } from "next-intl";

const formatSlugToName = (slug: string) => {
  return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function OrgSwitcher() {
  const t = useTranslations("admin");
  const { isMobile } = useSidebar()
  const { sessionClaims } = useAuth()
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()

  const roles = getRolesFromClaims(sessionClaims)

  // Compute slug before hooks so we can pass it into useQuery conditionally,
  // but the hook itself is still always called (no early return yet).
  let currentOrgSlug = params.orgSlug as string | undefined;
  if (currentOrgSlug === "admin" || (!currentOrgSlug && pathname.includes("/admin"))) {
    currentOrgSlug = "system";
  }
  const isSystemDashboard = currentOrgSlug === "system"

  // ALL hooks must be called before any early return
  const { selectedSchoolId, setSelectedSchoolId, isAvailable: hasSchoolFilter } = useAdminSchoolFilter()
  const schools = useQuery(
    api.schools.list,
    isSystemDashboard && hasSchoolFilter ? {} : "skip"
  )

  // Safe to early-return after all hooks
  if (!roles || Object.keys(roles).length === 0) return null

  const organizations = Object.entries(roles).map(([slug, role]) => ({
    name: slug === "system" ? t("globalSystem") : formatSlugToName(slug),
    slug: slug,
    role: role,
    icon: slug === "system" ? Shield : Building2,
  }))

  const activeOrg = organizations.find(org => org.slug === currentOrgSlug) || organizations[0]
  const activeSchool = selectedSchoolId !== "all"
    ? schools?.find(s => s._id === selectedSchoolId)
    : null

  return (
    <>
      {/* Org Switcher */}
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground border shadow-sm mt-4"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <activeOrg.icon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{activeOrg.name}</span>
                  <span className="truncate text-xs text-muted-foreground capitalize">{activeOrg.role}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("yourOrganizations")}
              </DropdownMenuLabel>
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.slug}
                  onClick={() => router.push(org.slug === "system" ? "/admin" : `/${org.slug}`)}
                  className="gap-2 p-2 cursor-pointer"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                    <org.icon className="size-4 shrink-0" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">{org.name}</span>
                    <span className="text-[10px] text-muted-foreground capitalize mt-0.5">{org.role}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* School Filter — superadmin system dashboard only */}
      {hasSchoolFilter && isSystemDashboard && (
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground border shadow-sm"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <School className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate text-[10px] text-muted-foreground uppercase tracking-wide">
                      {t("schoolFilter")}
                    </span>
                    <span className="truncate font-medium text-sm">
                      {activeSchool?.name ?? t("allSchools")}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                align="start"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t("filterBySchool")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSelectedSchoolId("all")}
                  className="gap-2 p-2 cursor-pointer"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                    <Building2 className="size-4 shrink-0" />
                  </div>
                  <span className="text-sm font-medium">{t("allSchools")}</span>
                </DropdownMenuItem>
                {schools?.map((school) => (
                  <DropdownMenuItem
                    key={school._id}
                    onClick={() => setSelectedSchoolId(school._id)}
                    className="gap-2 p-2 cursor-pointer"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border bg-background">
                      <School className="size-4 shrink-0" />
                    </div>
                    <span className="text-sm font-medium">{school.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
    </>
  )
}