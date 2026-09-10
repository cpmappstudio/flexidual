"use client";

import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useTranslations } from "next-intl";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { useCurrentOrgRole } from "@/hooks/use-current-org-role";
import { isStaffRole } from "@/lib/rbac";

export function NavMain() {
  const t = useTranslations();
  const pathname = usePathname();
  const { access, role, isLoaded } = useCurrentOrgRole();
  const basePath = useOrgBasePath();
  const canViewPeople =
    access?.canViewPeople ??
    (role === "admin" || role === "principal" || role === "superadmin");

  if (!isLoaded) return null;

  return (
    <>
      <SidebarGroup className={canViewPeople ? "pb-0" : undefined}>
        {role !== "student" && (
          <SidebarGroupLabel>{t("navigation.platform")}</SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu>
            {role === "student" && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === basePath || pathname === `${basePath}/`}
                  tooltip={t("navigation.dashboard")}
                  aria-label={t("navigation.dashboard")}
                  className="h-12 gap-3 px-2 text-base group-data-[collapsible=icon]:p-1!"
                >
                  <Link href={basePath}>
                    <Image
                      src="/home-icon.svg"
                      alt=""
                      width={32}
                      height={32}
                      aria-hidden="true"
                      className="group-data-[collapsible=icon]:size-6"
                    />
                    <span>{t("navigation.dashboard")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/catalog`)}
                tooltip={t("navigation.catalog")}
                aria-label={t("navigation.catalog")}
                className="h-12 gap-3 px-2 text-base group-data-[collapsible=icon]:p-1!"
              >
                <Link href={`${basePath}/catalog`}>
                  <Image
                    src="/resources-icon.svg"
                    alt=""
                    width={32}
                    height={32}
                    aria-hidden="true"
                    className="group-data-[collapsible=icon]:size-6"
                  />
                  <span>{t("navigation.catalog")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {isStaffRole(role) && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.includes(`${basePath}/classes`)}
                  tooltip={t("navigation.allClasses")}
                  aria-label={t("navigation.allClasses")}
                  className="h-12 gap-3 px-2 text-base group-data-[collapsible=icon]:p-1!"
                >
                  <Link href={`${basePath}/classes`}>
                    <Image
                      src="/classes-icon.svg"
                      alt=""
                      width={32}
                      height={32}
                      aria-hidden="true"
                      className="group-data-[collapsible=icon]:size-6"
                    />
                    <span>{t("navigation.allClasses")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/calendar`)}
                tooltip={t("navigation.calendar")}
                aria-label={t("navigation.calendar")}
                className="h-12 gap-3 px-2 text-base group-data-[collapsible=icon]:p-1!"
              >
                <Link href={`${basePath}/calendar`}>
                  <Image
                    src="/calendar-icon.svg"
                    alt=""
                    width={32}
                    height={32}
                    aria-hidden="true"
                    className="group-data-[collapsible=icon]:size-6"
                  />
                  <span>{t("navigation.calendar")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {canViewPeople && (
        <SidebarGroup className="pt-0 group-data-[collapsible=icon]:mt-4">
          <SidebarGroupLabel>
            {t("navigation.administration")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.includes(`${basePath}/students`)}
                  tooltip={t("navigation.students")}
                  aria-label={t("navigation.students")}
                  className="h-12 gap-3 px-2 text-base group-data-[collapsible=icon]:p-1!"
                >
                  <Link href={`${basePath}/students`}>
                    <Image
                      src="/students-icon.svg"
                      alt=""
                      width={32}
                      height={32}
                      aria-hidden="true"
                      className="group-data-[collapsible=icon]:size-6"
                    />
                    <span>{t("navigation.students")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.includes(`${basePath}/professors`)}
                  tooltip={t("navigation.teachers")}
                  aria-label={t("navigation.teachers")}
                  className="h-12 gap-3 px-2 text-base group-data-[collapsible=icon]:p-1!"
                >
                  <Link href={`${basePath}/professors`}>
                    <Image
                      src="/professors-icon.svg"
                      alt=""
                      width={32}
                      height={32}
                      aria-hidden="true"
                      className="group-data-[collapsible=icon]:size-6"
                    />
                    <span>{t("navigation.teachers")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}
