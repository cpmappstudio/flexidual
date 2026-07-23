import { redirect as nextRedirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { requireLocale } from "@/i18n/locale";
import type { TenantCampusParams } from "@/i18n/params";
import { buildCampusShellNavigation } from "@/lib/modules/registry";
import { ROUTES } from "@/lib/navigation/routes";
import { getCurrentTenantWorkspace } from "@/lib/organizations/server";
import { getRootHostUrl } from "@/lib/tenancy/domain";
import { canManageTenantWorkspace } from "@/lib/tenancy/workspace.server";

export default async function TenantCampusDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: TenantCampusParams;
}) {
  const { locale: requestedLocale, tenant, campus } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  const workspace = await getCurrentTenantWorkspace(tenant);

  if (!workspace) {
    nextRedirect(getRootHostUrl(locale));
  }

  const commonT = await getTranslations("Common");
  const canManageCampusPeople = canManageTenantWorkspace(workspace);

  const navigation = buildCampusShellNavigation({
    coreEntries: [
      {
        label: commonT("overview"),
        href: ROUTES.tenant.campuses.detail(tenant, campus),
      },
      ...(canManageCampusPeople
        ? [
            {
              label: commonT("people"),
              href: ROUTES.tenant.campuses.people(tenant, campus),
            },
          ]
        : []),
    ],
    moduleContext: {
      tenantSlug: tenant,
      campusSlug: campus,
      enabledCapabilityKeys: workspace.enabledCapabilityKeys,
      effectiveRole: workspace.effectiveRole,
      isPlatformAdmin: workspace.isPlatformAdmin,
      getModuleLabel: (moduleKey) => commonT(`modules.${moduleKey}` as "home"),
      getModuleNavigationLabel: (moduleKey, itemKey) =>
        commonT(
          `moduleNavigation.${moduleKey}.${itemKey}` as "home",
        ),
    },
  });

  return (
    <div className="flex w-full items-stretch overflow-hidden">
      <AppSidebar
        items={navigation.map((item) => ({
          title: item.label,
          url: item.href,
          icon: item.icon ? (
            <HugeiconsIcon
              icon={item.icon}
              strokeWidth={2}
              className="size-4"
              aria-hidden="true"
            />
          ) : null,
          items: item.items?.map((subItem) => ({
            title: subItem.label,
            url: subItem.href,
          })),
        }))}
        groupLabel={commonT("sidebar.groupLabel")}
        collapseLabel={commonT("sidebar.collapseLabel")}
        collapseTooltip={commonT("sidebar.collapseTooltip")}
        expandLabel={commonT("sidebar.expandLabel")}
        expandTooltip={commonT("sidebar.expandTooltip")}
        className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      />
      <SidebarInset className="min-w-0 px-4 py-10">{children}</SidebarInset>
    </div>
  );
}
