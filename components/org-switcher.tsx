"use client"

import * as React from "react"
import { ChevronsUpDown, Building2, Shield } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { useParams, usePathname } from "next/navigation" // <-- Added usePathname
import { useRouter } from "@/i18n/navigation"
import { getRolesFromClaims } from "@/lib/rbac"
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

// Helper to make slugs readable (e.g., "boston-public" -> "Boston Public")
const formatSlugToName = (slug: string) => {
  return slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function OrgSwitcher() {
  const { isMobile } = useSidebar()
  const { sessionClaims } = useAuth()
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  
  const roles = getRolesFromClaims(sessionClaims)

  if (!roles || Object.keys(roles).length === 0) return null

  // Format available organizations from the claims token
  const organizations = Object.entries(roles).map(([slug, role]) => ({
    name: slug === "system" ? "Global System" : formatSlugToName(slug),
    slug: slug,
    role: role,
    icon: slug === "system" ? Shield : Building2,
  }))

  let currentOrgSlug = params.orgSlug as string | undefined;
  if (currentOrgSlug === "admin" || (!currentOrgSlug && pathname.includes("/admin"))) {
      currentOrgSlug = "system";
  }

  const activeOrg = organizations.find(org => org.slug === currentOrgSlug) || organizations[0]

  return (
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
                <span className="truncate font-semibold">
                  {activeOrg.name}
                </span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {activeOrg.role}
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
              Your Organizations
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
            <DropdownMenuSeparator />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}