"use client";

import * as React from "react";
import { Building2, MapPin, Plus, Settings2 } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "@/i18n/navigation";
import { SchoolDialog } from "@/components/admin/schools/school-dialog";
import { CampusDialog } from "@/components/admin/campuses/campus-dialog";
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
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function OrgSwitcher() {
  const t = useTranslations("admin");
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const options = useQuery(
    api.organizations.getSwitcherOptions,
    isAuthenticated ? {} : "skip",
  );
  const [schoolDialogOpen, setSchoolDialogOpen] = React.useState(false);
  const [campusSchoolId, setCampusSchoolId] =
    React.useState<Id<"schools"> | null>(null);

  const schools = React.useMemo(
    () => options?.schools ?? [],
    [options?.schools],
  );
  const campuses = React.useMemo(
    () => options?.campuses ?? [],
    [options?.campuses],
  );
  const manageableSchoolIds = React.useMemo(
    () => new Set(options?.manageableSchoolIds ?? []),
    [options?.manageableSchoolIds],
  );
  const isRestrictedStaff =
    !options?.canCreateInstitutions && manageableSchoolIds.size === 0;
  const flattenInstitution = isRestrictedStaff && schools.length === 1;
  const isInteractive =
    !isRestrictedStaff || schools.length > 1 || campuses.length > 1;

  const routeCampus = campuses.find((campus) => campus.slug === orgSlug);
  const routeSchool = schools.find((school) => school.slug === orgSlug);
  const activeSchool =
    routeSchool ??
    schools.find((school) => school._id === routeCampus?.schoolId) ??
    schools[0];
  const activeCampus =
    routeCampus ??
    (!routeSchool
      ? campuses.find((campus) => campus.schoolId === activeSchool?._id)
      : undefined);

  if (!options || schools.length === 0) return null;

  const campusSchool = schools.find((school) => school._id === campusSchoolId);

  const selectCampus = (campusId: Id<"campuses">) => {
    const campus = campuses.find((item) => item._id === campusId);
    if (campus) router.push(`/${campus.slug}`);
    if (isMobile) setOpenMobile(false);
  };

  const label = (
    <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
      <span className="truncate text-base font-bold leading-snug text-primary">
        {activeCampus?.name ?? activeSchool.name}
      </span>
      {activeCampus && (
        <span className="truncate text-sm text-muted-foreground">
          {activeSchool.name}
        </span>
      )}
    </div>
  );
  const activeOrganizationName = activeCampus?.name ?? activeSchool.name;
  const compactSwitcherIcon = (
    <Image
      src="/school-campus-switcher.svg"
      alt=""
      width={28}
      height={28}
      aria-hidden="true"
      className="mt-0.5 size-7 shrink-0 group-data-[collapsible=icon]:mt-0"
    />
  );

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          {!isInteractive ? (
            <SidebarMenuButton
              size="lg"
              title={state === "collapsed" ? activeOrganizationName : undefined}
              aria-label={activeOrganizationName}
              className="h-auto min-h-14 cursor-default items-start px-2 py-2 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
            >
              {compactSwitcherIcon}
              {label}
            </SidebarMenuButton>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  title={
                    state === "collapsed" ? activeOrganizationName : undefined
                  }
                  aria-label={activeOrganizationName}
                  className="h-auto min-h-14 items-start px-2 py-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
                >
                  {compactSwitcherIcon}
                  {label}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="max-h-[70vh] w-[calc(100vw-2rem)] max-w-80 overflow-y-auto rounded-lg sm:min-w-64"
                align="start"
                side={isMobile ? "bottom" : "right"}
                sideOffset={4}
                collisionPadding={16}
              >
                {flattenInstitution ? (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {t("campuses")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {campuses.map((campus) => (
                      <DropdownMenuItem
                        key={campus._id}
                        className="cursor-pointer gap-2"
                        onSelect={() => selectCampus(campus._id)}
                      >
                        <MapPin className="size-4" />
                        <span className="min-w-0 flex-1 whitespace-normal break-words">
                          {campus.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : isMobile ? (
                  schools.map((school) => (
                    <React.Fragment key={school._id}>
                      <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2 text-sm">
                        <Building2 className="size-4" />
                        <span className="min-w-0 whitespace-normal break-words">
                          {school.name}
                        </span>
                      </DropdownMenuLabel>
                      {campuses
                        .filter((campus) => campus.schoolId === school._id)
                        .map((campus) => (
                          <DropdownMenuItem
                            key={campus._id}
                            className="cursor-pointer gap-2 pl-6"
                            onSelect={() => selectCampus(campus._id)}
                          >
                            <MapPin className="size-4" />
                            {campus.name}
                          </DropdownMenuItem>
                        ))}
                      {manageableSchoolIds.has(school._id) && (
                        <DropdownMenuItem
                          className="cursor-pointer pl-6"
                          onSelect={() => setCampusSchoolId(school._id)}
                        >
                          <Plus className="size-4" />
                          {t("createCampus")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                    </React.Fragment>
                  ))
                ) : (
                  schools.map((school) => {
                    const schoolCampuses = campuses.filter(
                      (campus) => campus.schoolId === school._id,
                    );
                    const canManage = manageableSchoolIds.has(school._id);
                    return (
                      <DropdownMenuSub key={school._id}>
                        <DropdownMenuSubTrigger className="gap-2 p-2">
                          <Building2 className="size-4" />
                          <span className="min-w-0 flex-1 whitespace-normal break-words font-medium">
                            {school.name}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="min-w-56">
                            <div className="flex items-center">
                              <DropdownMenuLabel className="min-w-0 flex-1 text-xs text-muted-foreground">
                                {t("campuses")}
                              </DropdownMenuLabel>
                              {canManage && (
                                <DropdownMenuItem
                                  className="size-7 cursor-pointer justify-center p-0"
                                  aria-label={t("manageCampuses", {
                                    institution: school.name,
                                  })}
                                  onSelect={() => {
                                    router.push(
                                      `/${school.slug}/settings/campuses`,
                                    );
                                  }}
                                >
                                  <Settings2 className="size-4" />
                                </DropdownMenuItem>
                              )}
                            </div>
                            {schoolCampuses.map((campus) => (
                              <DropdownMenuItem
                                key={campus._id}
                                className="cursor-pointer gap-2"
                                onSelect={() => selectCampus(campus._id)}
                              >
                                <MapPin className="size-4" />
                                <span className="min-w-0 flex-1 whitespace-normal break-words">
                                  {campus.name}
                                </span>
                              </DropdownMenuItem>
                            ))}
                            {canManage && (
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
                    );
                  })
                )}

                {options.canCreateInstitutions && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => setSchoolDialogOpen(true)}
                    >
                      <Plus className="size-4" />
                      {t("createInstitution")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarMenuItem>
      </SidebarMenu>

      <SchoolDialog
        trigger={null}
        open={schoolDialogOpen}
        onOpenChange={setSchoolDialogOpen}
      />
      {campusSchool && (
        <CampusDialog
          trigger={null}
          parentInstitution={{ _id: campusSchool._id, name: campusSchool.name }}
          open
          onOpenChange={(open) => {
            if (!open) setCampusSchoolId(null);
          }}
        />
      )}
    </>
  );
}
