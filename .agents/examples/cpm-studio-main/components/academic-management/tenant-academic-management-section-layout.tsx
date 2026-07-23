"use client";

import {
  CalendarRange,
  ChevronRight,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/navigation/routes";

type AcademicManagementNavigationItem = {
  label: string;
  href: string;
};

type AcademicManagementNavigationGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: AcademicManagementNavigationItem[];
};

const activeSidebarItemClassName =
  "data-[active=true]:bg-foreground/[0.045] data-[active=true]:text-foreground";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getNavigationItems(groups: AcademicManagementNavigationGroup[]) {
  return groups.flatMap((group) => group.items);
}

function AcademicManagementSidebarNavigation({
  groups,
  pathname,
}: {
  groups: AcademicManagementNavigationGroup[];
  pathname: string;
}) {
  return (
    <Sidebar collapsible="none" className="hidden bg-transparent md:flex">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {groups.map((group) => {
                const Icon = group.icon;

                return (
                  <Collapsible
                    key={group.key}
                    asChild
                    defaultOpen
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton type="button">
                          <Icon aria-hidden="true" />
                          <span>{group.label}</span>
                          <ChevronRight
                            aria-hidden="true"
                            className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="border-l-foreground/8 pl-6">
                          {group.items.map((item) => (
                            <SidebarMenuSubItem key={item.href}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, item.href)}
                                className={activeSidebarItemClassName}
                              >
                                <Link href={item.href}>
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function AcademicManagementMobileSectionSelect({
  groups,
  selectedHref,
}: {
  groups: AcademicManagementNavigationGroup[];
  selectedHref: string;
}) {
  const t = useTranslations("TenantAcademicManagement");
  const { push } = useRouter();

  return (
    <div className="mb-4 md:hidden">
      <Select value={selectedHref} onValueChange={(href) => push(href)}>
        <SelectTrigger
          aria-label={t("navigation.selectSection")}
          className="w-full"
        >
          <SelectValue placeholder={t("navigation.selectSection")} />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group, index) => (
            <SelectGroup key={group.key}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.href} value={item.href}>
                  {item.label}
                </SelectItem>
              ))}
              {index < groups.length - 1 ? <SelectSeparator /> : null}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TenantAcademicManagementSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations("TenantAcademicManagement");
  const pathname = usePathname();
  const navigationGroups: AcademicManagementNavigationGroup[] = [
    {
      key: "people",
      label: t("navigation.people"),
      icon: GraduationCap,
      items: [
        {
          label: t("navigation.students"),
          href: ROUTES.tenant.academicManagementSections.students(),
        },
        {
          label: t("navigation.teachers"),
          href: ROUTES.tenant.academicManagementSections.teachers(),
        },
      ],
    },
    {
      key: "structure",
      label: t("navigation.structure"),
      icon: CalendarRange,
      items: [
        {
          label: t("navigation.academicPeriods"),
          href: ROUTES.tenant.academicManagementSections.academicPeriods(),
        },
        {
          label: t("navigation.curriculumOfferings"),
          href: ROUTES.tenant.academicManagementSections.curriculumOfferings(),
        },
      ],
    },
  ];
  const navigationItems = getNavigationItems(navigationGroups);
  const selectedHref =
    navigationItems.find((item) => isActivePath(pathname, item.href))?.href ??
    ROUTES.tenant.academicManagementSections.students();

  return (
    <div className="flex min-h-0 w-full items-stretch">
      <AcademicManagementSidebarNavigation
        groups={navigationGroups}
        pathname={pathname}
      />

      <main className="min-w-0 flex-1 pb-4 md:px-6 md:pb-6">
        <AcademicManagementMobileSectionSelect
          groups={navigationGroups}
          selectedHref={selectedHref}
        />
        {children}
      </main>
    </div>
  );
}
