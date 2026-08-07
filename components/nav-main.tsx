"use client";

import Image from "next/image";
import { Link, usePathname } from "@/i18n/navigation";
import {
  SidebarGroup,
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
    <SidebarGroup>
      {role !== "student" && (
        <SidebarGroupLabel>{t("navigation.platform")}</SidebarGroupLabel>
      )}
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname === basePath}
            className="h-12 gap-3 px-2 text-base"
          >
            <Link href={basePath}>
              <Image
                src="/home-icon.svg"
                alt=""
                width={32}
                height={32}
                aria-hidden="true"
              />
              <span>{t("navigation.dashboard")}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname.includes(`${basePath}/catalog`)}
            className="h-12 gap-3 px-2 text-base"
          >
            <Link href={`${basePath}/catalog`}>
              <Image
                src="/resources-icon.svg"
                alt=""
                width={32}
                height={32}
                aria-hidden="true"
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
              className="h-12 gap-3 px-2 text-base"
            >
              <Link href={`${basePath}/classes`}>
                <Image
                  src="/classes-icon.svg"
                  alt=""
                  width={32}
                  height={32}
                  aria-hidden="true"
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
            className="h-12 gap-3 px-2 text-base"
          >
            <Link href={`${basePath}/calendar`}>
              <Image
                src="/calendar-icon.svg"
                alt=""
                width={32}
                height={32}
                aria-hidden="true"
              />
              <span>{t("navigation.calendar")}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        {canViewPeople && (
          <>
            <SidebarGroupLabel className="mt-4">
              {t("navigation.administration")}
            </SidebarGroupLabel>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.includes(`${basePath}/students`)}
                className="h-12 gap-3 px-2 text-base"
              >
                <Link href={`${basePath}/students`}>
                  <Image
                    src="/students-icon.svg"
                    alt=""
                    width={32}
                    height={32}
                    aria-hidden="true"
                  />
                  <span>{t("navigation.students")}</span>
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
                  <Image
                    src="/professors-icon.svg"
                    alt=""
                    width={32}
                    height={32}
                    aria-hidden="true"
                  />
                  <span>{t("navigation.teachers")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
