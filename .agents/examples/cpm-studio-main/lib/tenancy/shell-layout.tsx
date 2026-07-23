import "server-only";

import { fetchQuery } from "convex/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Switcher } from "@/components/switcher";
import { TenantActiveProfileLifecycle } from "@/components/tenant/tenant-active-profile-lifecycle";
import { TenantProfileScopedActivityRecorder } from "@/components/tenant/tenant-profile-scoped-activity-recorder";
import { TenantShellFrame } from "@/components/tenant/tenant-shell-frame";
import { TenantShellMobileSidebar } from "@/components/tenant/tenant-shell-mobile-sidebar";
import { api } from "@/convex/_generated/api";
import { redirect } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { buildTenantShellNavigation } from "@/lib/modules/registry";
import { ROUTES } from "@/lib/navigation/routes";
import { getRootHostUrl } from "@/lib/tenancy/domain";
import {
  parseActiveProfileCookieValue,
  TENANT_ACTIVE_PROFILE_COOKIE_NAME,
} from "@/lib/tenancy/profile-selection";
import type { TenantProfileSelection } from "@/lib/tenancy/profile-selection-types";
import { getTenantShellState } from "@/lib/tenancy/shell.server";
import { isTenantOnboardingRequired } from "@/lib/tenancy/services";
import { canManageTenantWorkspace } from "@/lib/tenancy/workspace.server";

type TenantHeaderWorkspaceLink = {
  href: string;
  label: string;
  detail?: string;
};

function getTenantHeaderWorkspaceLink({
  canManageTenant,
  canSwitchProfile,
  organizationName,
  switchProfileHref,
  switchProfileLabel,
  teamSettingsHref,
  teamSettingsLabel,
}: {
  canManageTenant: boolean;
  canSwitchProfile: boolean;
  organizationName: string;
  switchProfileHref: string;
  switchProfileLabel: string;
  teamSettingsHref: string;
  teamSettingsLabel: string;
}): TenantHeaderWorkspaceLink | undefined {
  if (canManageTenant) {
    return {
      href: teamSettingsHref,
      label: teamSettingsLabel,
      detail: organizationName,
    };
  }

  if (canSwitchProfile) {
    return {
      href: switchProfileHref,
      label: switchProfileLabel,
      detail: organizationName,
    };
  }

  return undefined;
}

function isTenantProfileSelectionReady({
  cookieValue,
  profileSelection,
}: {
  cookieValue: string | undefined;
  profileSelection: TenantProfileSelection | null;
}) {
  if (!profileSelection?.requiresSelection) {
    return true;
  }

  const selectedProfile = parseActiveProfileCookieValue(cookieValue);
  if (
    selectedProfile?.kind === "guardian" &&
    profileSelection.guardian &&
    (!profileSelection.guardian.pinRequired ||
      profileSelection.guardian.pinVerified)
  ) {
    return true;
  }

  if (
    selectedProfile?.kind === "child" &&
    profileSelection.children.some(
      (child) => child.person._id === selectedProfile.organizationPersonId,
    )
  ) {
    return true;
  }

  return false;
}

export async function renderTenantShellLayout(args: {
  tenantSlug: string;
  locale: AppLocale;
  children: ReactNode;
  contentClassName?: string;
  sidebarMode?: "provided" | "tenant-mobile";
}) {
  const { token, preloadedCurrentUser, currentUser, access } =
    await getTenantShellState(args.tenantSlug);

  if (!token) {
    return redirect({
      href: ROUTES.tenant.auth.signIn(args.tenantSlug),
      locale: args.locale,
    });
  }

  if (!currentUser || !preloadedCurrentUser) {
    return redirect({
      href: ROUTES.tenant.auth.signIn(args.tenantSlug),
      locale: args.locale,
    });
  }

  if (!access) {
    return redirect({
      href: ROUTES.tenant.auth.signIn(args.tenantSlug),
      locale: args.locale,
    });
  }

  const canManageTenant = canManageTenantWorkspace(access);

  if (
    canManageTenant &&
    isTenantOnboardingRequired(access.enabledCapabilityKeys)
  ) {
    return redirect({
      href: ROUTES.tenant.onboarding(args.tenantSlug),
      locale: args.locale,
    });
  }

  const profileSelectionEnabled = !access.isPlatformAdmin && !access.membership;
  const [commonT, profileSelection] = await Promise.all([
    getTranslations("Common"),
    profileSelectionEnabled
      ? fetchQuery(
          api.platform.people.getCurrentProfileSelection,
          { slug: args.tenantSlug },
          { token },
        ).then((selection) => selection as TenantProfileSelection)
      : Promise.resolve(null),
  ]);

  if (profileSelectionEnabled) {
    const cookieStore = await cookies();
    const isProfileSelectionReady = isTenantProfileSelectionReady({
      cookieValue: cookieStore.get(TENANT_ACTIVE_PROFILE_COOKIE_NAME)?.value,
      profileSelection,
    });

    if (!isProfileSelectionReady) {
      return redirect({
        href: ROUTES.tenant.profiles(args.tenantSlug),
        locale: args.locale,
      });
    }
  }

  const teamSettingsHref = ROUTES.tenant.teamSettings(args.tenantSlug);
  const academicManagementHref = ROUTES.tenant.academicManagement(
    args.tenantSlug,
  );
  const logoHref = access.isPlatformAdmin
    ? getRootHostUrl(args.locale, ROUTES.institutions.root)
    : ROUTES.tenant.root(args.tenantSlug);
  const navigation = buildTenantShellNavigation({
    rootLabel: commonT("campuses"),
    coreEntries: canManageTenant
      ? [
          {
            label: commonT("teamSettings"),
            href: teamSettingsHref,
          },
          {
            label: commonT("academicManagement"),
            href: academicManagementHref,
          },
        ]
      : [],
    moduleContext: {
      tenantSlug: args.tenantSlug,
      enabledCapabilityKeys: access.enabledCapabilityKeys,
      effectiveRole: access.effectiveRole,
      isPlatformAdmin: access.isPlatformAdmin,
      getModuleLabel: (moduleKey) =>
        commonT(`modules.${moduleKey}` as "campuses"),
      getModuleNavigationLabel: (moduleKey, itemKey) =>
        commonT(
          `moduleNavigation.${moduleKey}.${itemKey}` as "campuses",
        ),
    },
  });
  const sidebarLabels = {
    collapseLabel: commonT("sidebar.collapseLabel"),
    collapseTooltip: commonT("sidebar.collapseTooltip"),
    expandLabel: commonT("sidebar.expandLabel"),
    expandTooltip: commonT("sidebar.expandTooltip"),
    groupLabel: commonT("sidebar.groupLabel"),
  };
  const tenantSidebarItems = navigation.map((item) => ({
    title: item.label,
    url: item.href,
    icon: item.icon ? (
      <HugeiconsIcon icon={item.icon} strokeWidth={2} aria-hidden="true" />
    ) : null,
    items: item.items?.map((subItem) => ({
      title: subItem.label,
      url: subItem.href,
    })),
  }));
  const sidebarMode = args.sidebarMode ?? "tenant-mobile";
  const workspaceLink = getTenantHeaderWorkspaceLink({
    canManageTenant,
    canSwitchProfile: profileSelection?.requiresSelection ?? false,
    organizationName: access.organization.name,
    switchProfileHref: ROUTES.tenant.profiles(args.tenantSlug),
    switchProfileLabel: commonT("switchProfile"),
    teamSettingsHref,
    teamSettingsLabel: commonT("teamSettings"),
  });

  return (
    <TenantShellFrame
      contentClassName={args.contentClassName}
      header={{
        brandLabelMode: "collapsed",
        logoHref,
        navigation,
        preloadedCurrentUser,
        tenantSlug: args.tenantSlug,
        workspaceLink,
        signOutRedirectHref: ROUTES.tenant.auth.signIn(args.tenantSlug),
        useLogoAsMobileSidebarTrigger: true,
        switcher: (
          <Switcher
            currentOrganizationSlug={args.tenantSlug}
            currentOrganization={access.organization}
            allowEmptyCampusSelection
          />
        ),
      }}
      sidebar={
        sidebarMode === "tenant-mobile" ? (
          <TenantShellMobileSidebar
            brand={{ appName: commonT("appName"), href: logoHref }}
            items={tenantSidebarItems}
            {...sidebarLabels}
          />
        ) : null
      }
    >
      <TenantActiveProfileLifecycle enabled={profileSelectionEnabled} />
      <TenantProfileScopedActivityRecorder
        slug={args.tenantSlug}
        profileSelectionEnabled={profileSelectionEnabled}
      />
      {args.children}
    </TenantShellFrame>
  );
}
