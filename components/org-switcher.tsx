"use client"

import * as React from "react"
import { Building2, MapPin, Plus } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { useParams, usePathname } from "next/navigation"
import { useRouter } from "@/i18n/navigation"
import { getRolesFromClaims } from "@/lib/rbac"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useAdminSchoolFilter } from "@/components/providers/admin-school-filter-provider"
import { SchoolDialog } from "@/components/admin/schools/school-dialog"
import { CampusDialog } from "@/components/admin/campuses/campus-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useTranslations } from "next-intl"

export function OrgSwitcher() {
  const t = useTranslations("admin")
  const { isMobile, setOpenMobile } = useSidebar()
  const { sessionClaims } = useAuth()
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const roles = getRolesFromClaims(sessionClaims)
  const isSuperAdmin = roles?.system === "superadmin"
  const isSystemDashboard = params.orgSlug === "admin" || pathname.includes("/admin")
  const currentSlug = params.orgSlug as string | undefined

  const {
    selectedSchoolId,
    setSelectedSchoolId,
    selectedCampusId,
    setSelectedCampusId,
  } = useAdminSchoolFilter()
  const schools = useQuery(api.schools.list, { isActive: true })
  const campuses = useQuery(api.campuses.list, { isActive: true })
  const [schoolDialogOpen, setSchoolDialogOpen] = React.useState(false)
  const [campusSchoolId, setCampusSchoolId] = React.useState<Id<"schools"> | null>(null)

  const visibleSchools = React.useMemo(() => {
    if (!schools || !campuses || !roles) return []

    return schools
      .filter((school) => isSuperAdmin || roles[school.slug] || campuses.some((campus) => campus.schoolId === school._id && roles[campus.slug]))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [campuses, isSuperAdmin, roles, schools])

  const visibleCampuses = React.useMemo(() => {
    if (!campuses || !roles) return []

    return campuses
      .filter((campus) => isSuperAdmin || !!roles[campus.slug])
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [campuses, isSuperAdmin, roles])

  React.useEffect(() => {
    if (!isSystemDashboard || !isSuperAdmin || visibleSchools.length === 0) return

    const school = visibleSchools.find((item) => item._id === selectedSchoolId) ?? visibleSchools[0]
    const schoolCampuses = visibleCampuses.filter((campus) => campus.schoolId === school._id)
    const campus = schoolCampuses.find((item) => item._id === selectedCampusId) ?? schoolCampuses[0]

    if (selectedSchoolId !== school._id) setSelectedSchoolId(school._id)
    if (campus && selectedCampusId !== campus._id) setSelectedCampusId(campus._id)
  }, [
    isSuperAdmin,
    isSystemDashboard,
    selectedCampusId,
    selectedSchoolId,
    setSelectedCampusId,
    setSelectedSchoolId,
    visibleCampuses,
    visibleSchools,
  ])

  if (!roles || Object.keys(roles).length === 0) return null

  const routeCampus = visibleCampuses.find((campus) => campus.slug === currentSlug)
  const routeSchool = visibleSchools.find((school) => school.slug === currentSlug)
  const activeCampus = isSystemDashboard
    ? visibleCampuses.find((campus) => campus._id === selectedCampusId)
    : routeCampus
  const activeSchool = isSystemDashboard
    ? visibleSchools.find((school) => school._id === selectedSchoolId) ?? visibleSchools[0]
    : routeSchool ?? visibleSchools.find((school) => school._id === activeCampus?.schoolId) ?? visibleSchools[0]

  const selectSchool = (schoolSlug: string) => {
    router.push(`/${schoolSlug}`)
    if (isMobile) setOpenMobile(false)
  }

  const selectCampus = (schoolId: Id<"schools">, campusId: Id<"campuses">, campusSlug: string) => {
    if (isSystemDashboard) {
      setSelectedSchoolId(schoolId)
      setSelectedCampusId(campusId)
    } else {
      router.push(`/${campusSlug}`)
    }
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="h-auto min-h-14 items-start px-2 py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight">
                  <span className="whitespace-normal break-words text-base font-bold leading-snug text-primary">
                    {activeCampus?.name ?? activeSchool?.name ?? t("noInstitutions")}
                  </span>
                  <span className="whitespace-normal break-words text-sm text-muted-foreground">
                    {activeSchool?.name ?? t("noInstitutions")}
                  </span>
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="max-h-[70vh] w-[calc(100vw-2rem)] max-w-80 overflow-y-auto rounded-lg sm:min-w-64"
              align="start"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
              collisionPadding={16}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("institutions")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {isMobile ? (
                visibleSchools.map((school) => {
                  const schoolCampuses = visibleCampuses.filter((campus) => campus.schoolId === school._id)
                  return (
                    <React.Fragment key={school._id}>
                      <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2 text-sm">
                        <Building2 className="size-4 shrink-0" />
                        <span className="min-w-0 whitespace-normal break-words font-medium">{school.name}</span>
                      </DropdownMenuLabel>
                      {!isSystemDashboard && roles[school.slug] && (
                        <DropdownMenuItem
                          className={`min-h-10 cursor-pointer pl-6 ${routeSchool?._id === school._id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
                          onSelect={() => selectSchool(school.slug)}
                        >
                          <Building2 className="size-4" />
                          <span className="min-w-0 whitespace-normal break-words">{t("institutionOverview")}</span>
                        </DropdownMenuItem>
                      )}
                      {schoolCampuses.map((campus) => (
                        <DropdownMenuItem
                          key={campus._id}
                          className={`min-h-10 cursor-pointer gap-2 pl-6 ${activeCampus?._id === campus._id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
                          onSelect={() => selectCampus(school._id, campus._id, campus.slug)}
                        >
                          <MapPin className="size-4" />
                          <span className="min-w-0 whitespace-normal break-words">{campus.name}</span>
                        </DropdownMenuItem>
                      ))}
                      {schoolCampuses.length === 0 && (
                        <DropdownMenuItem className="pl-6" disabled>{t("noCampusesFound")}</DropdownMenuItem>
                      )}
                      {isSuperAdmin && (
                        <DropdownMenuItem
                          className="min-h-10 cursor-pointer pl-6"
                          onSelect={() => setCampusSchoolId(school._id)}
                        >
                          <Plus className="size-4" />
                          {t("createCampus")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </React.Fragment>
                  )
                })
              ) : (
                visibleSchools.map((school) => {
                  const schoolCampuses = visibleCampuses.filter((campus) => campus.schoolId === school._id)
                  return (
                    <DropdownMenuSub key={school._id}>
                      <DropdownMenuSubTrigger className="gap-2 p-2">
                        <Building2 className="size-4" />
                        <span className="min-w-0 flex-1 whitespace-normal break-words font-medium">{school.name}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="min-w-56">
                          {!isSystemDashboard && roles[school.slug] && (
                            <DropdownMenuItem
                              className={`cursor-pointer ${routeSchool?._id === school._id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
                              onSelect={() => selectSchool(school.slug)}
                            >
                              <Building2 className="size-4" />
                              <span className="min-w-0 flex-1 whitespace-normal break-words">{t("institutionOverview")}</span>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("campuses")}</DropdownMenuLabel>
                          {schoolCampuses.map((campus) => (
                            <DropdownMenuItem
                              key={campus._id}
                              className={`cursor-pointer gap-2 ${activeCampus?._id === campus._id ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}`}
                              onSelect={() => selectCampus(school._id, campus._id, campus.slug)}
                            >
                              <MapPin className="size-4" />
                              <span className="min-w-0 flex-1 whitespace-normal break-words">{campus.name}</span>
                            </DropdownMenuItem>
                          ))}
                          {schoolCampuses.length === 0 && (
                            <DropdownMenuItem disabled>{t("noCampusesFound")}</DropdownMenuItem>
                          )}
                          {isSuperAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => setCampusSchoolId(school._id)}
                              >
                                <Plus className="size-4" />
                                {t("createCampus")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  )
                })
              )}

              {visibleSchools.length === 0 && (
                <DropdownMenuItem disabled>{t("noInstitutions")}</DropdownMenuItem>
              )}

              {isSuperAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => setSchoolDialogOpen(true)}>
                    <Plus className="size-4" />
                    {t("createInstitution")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SchoolDialog trigger={null} open={schoolDialogOpen} onOpenChange={setSchoolDialogOpen} />
      <CampusDialog
        trigger={null}
        defaultSchoolId={campusSchoolId ?? undefined}
        open={campusSchoolId !== null}
        onOpenChange={(open) => {
          if (!open) setCampusSchoolId(null)
        }}
      />
    </>
  )
}
