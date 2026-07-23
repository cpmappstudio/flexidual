"use client";

import type { ReactNode } from "react";
import {
  BookOpen,
  Building2,
  CalendarRange,
  GraduationCap,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { cn } from "@/lib/utils";

export function SettingsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("settings");
  const pathname = usePathname();
  const router = useRouter();
  const { context, basePath, profilePath } = useSettingsContext();
  const campusesPath = `${basePath}/campuses`;
  const academicPath = `${basePath}/academic`;
  const gradesPath = `${basePath}/grades`;
  const curriculumsPath = `${basePath}/curriculums`;
  const administratorsPath = `${basePath}/administrators`;
  const institutionItems = context?.canViewInstitutionSettings
    ? [
        {
          href: basePath,
          label: t("general"),
          icon: Building2,
          exact: true,
        },
        {
          href: campusesPath,
          label: t("campusesLabel"),
          icon: Building2,
          exact: false,
        },
        {
          href: academicPath,
          label: t("academicLabel"),
          icon: CalendarRange,
          exact: false,
        },
        {
          href: gradesPath,
          label: t("gradesLabel"),
          icon: GraduationCap,
          exact: false,
        },
        {
          href: curriculumsPath,
          label: t("curriculumsLabel"),
          icon: BookOpen,
          exact: false,
        },
        {
          href: administratorsPath,
          label: t("administratorsLabel"),
          icon: UsersRound,
          exact: false,
        },
      ]
    : [];
  const items = [
    ...institutionItems,
    {
      href: profilePath,
      label: t("profileAndSecurity"),
      icon: ShieldCheck,
      exact: false,
    },
  ];
  const activeItem =
    items.find((item) =>
      item.exact ? pathname === item.href : pathname.startsWith(item.href),
    ) ?? items[0];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mb-6 md:hidden">
        <Select value={activeItem?.href} onValueChange={router.push}>
          <SelectTrigger>
            <SelectValue placeholder={t("selectSection")} />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <span className="flex items-center gap-2">
                  <item.icon className="size-4" />
                  {item.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-1 gap-8">
        <nav
          className="hidden w-56 shrink-0 flex-col gap-1 md:flex"
          aria-label={t("title")}
        >
          {context?.canViewInstitutionSettings && (
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="h-8 gap-2 px-2 text-sm font-semibold text-foreground">
                <Building2 className="size-4" />
                {t("institution")}
              </SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuSub className="mx-2">
                    {institutionItems.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={
                            item.exact
                              ? pathname === item.href
                              : pathname.startsWith(item.href)
                          }
                        >
                          <Link href={item.href}>{item.label}</Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )}
          <Link
            href={profilePath}
            className={cn(
              "mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              pathname.startsWith(profilePath) &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <ShieldCheck className="size-5" />
            {t("profileAndSecurity")}
          </Link>
        </nav>
        <div className="min-w-0 flex-1 pb-6">{children}</div>
      </div>
    </div>
  );
}
