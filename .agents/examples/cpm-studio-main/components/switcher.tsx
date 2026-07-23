"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight01Icon,
  Settings01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { api } from "@/convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "@/i18n/navigation";
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu";
import { getImageFallbackLabel, getOptionalImageSrc } from "@/lib/files/image";
import { ROUTES } from "@/lib/navigation/routes";
import {
  extractCampusSlug,
  getTenantCanonicalHref,
  getTenantHostUrl,
} from "@/lib/tenancy/domain";
import { cn } from "@/lib/utils";

type SwitcherOrganization = {
  _id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
};

type MenuView = "campus" | "institution";

type SwitcherProps = {
  currentOrganizationSlug: string;
  currentOrganization: SwitcherOrganization;
  allowEmptyCampusSelection?: boolean;
};

function OrganizationAvatar({
  organization,
}: {
  organization: SwitcherOrganization;
}) {
  return (
    <Avatar className="size-5 rounded-md" size="sm">
      <AvatarImage
        src={getOptionalImageSrc(organization.imageUrl)}
        alt={organization.name}
        className="rounded-md"
      />
      <AvatarFallback className="rounded-md text-[0.625rem] font-semibold">
        {getImageFallbackLabel({ name: organization.name, fallback: "OR" })}
      </AvatarFallback>
    </Avatar>
  );
}

export function Switcher({
  currentOrganizationSlug,
  currentOrganization,
  allowEmptyCampusSelection = false,
}: SwitcherProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Common");
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<MenuView>("campus");
  const [selectedOrganization, setSelectedOrganization] =
    React.useState<SwitcherOrganization>(currentOrganization);
  const [selectedCampus, setSelectedCampus] = React.useState<string | null>(
    null,
  );

  const selectedOrganizationSlug =
    selectedOrganization.slug ?? currentOrganizationSlug;
  const currentInternalHref = getTenantCanonicalHref(
    pathname,
    currentOrganizationSlug,
  );
  const currentCampusSlug =
    extractCampusSlug(pathname) ?? extractCampusSlug(currentInternalHref);
  const isCampusDetailRoute = currentCampusSlug !== null;
  const shouldLoadSwitcherData = open || isCampusDetailRoute;
  const organizationResults = useQuery(
    api.organizations.listAccessible,
    open ? {} : "skip",
  );
  const organizationCampuses = useQuery(
    api.platform.campuses.listForOrganization,
    shouldLoadSwitcherData ? { slug: selectedOrganizationSlug } : "skip",
  );
  const organizations = React.useMemo(() => {
    if (!organizationResults) {
      return [currentOrganization];
    }

    const organizationBySlug = new Map<string, SwitcherOrganization>();
    organizationBySlug.set(currentOrganization.slug, currentOrganization);
    for (const organization of organizationResults) {
      organizationBySlug.set(organization.slug, organization);
    }

    return [...organizationBySlug.values()];
  }, [currentOrganization, organizationResults]);

  const campuses = React.useMemo(
    () =>
      (organizationCampuses ?? []).map((campus) => ({
        name: campus.name,
        slug: campus.slug,
      })),
    [organizationCampuses],
  );
  const teamSettingsInternalHref = getTenantCanonicalHref(
    ROUTES.tenant.teamSettings(selectedOrganizationSlug),
    selectedOrganizationSlug,
  );
  const teamSettingsHref = getTenantHostUrl(
    selectedOrganizationSlug,
    locale,
    teamSettingsInternalHref,
  );
  const isTeamSettingsRoute = currentInternalHref === teamSettingsInternalHref;

  React.useEffect(() => {
    setSelectedOrganization(
      organizations.find(
        (organization) => organization.slug === currentOrganizationSlug,
      ) ?? currentOrganization,
    );
  }, [currentOrganization, currentOrganizationSlug, organizations]);

  React.useEffect(() => {
    setSelectedCampus(
      currentCampusSlug ??
        (allowEmptyCampusSelection ? null : (campuses[0]?.slug ?? null)),
    );
  }, [allowEmptyCampusSelection, campuses, currentCampusSlug]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      setView("campus");
    }
  }

  function handleOrganizationChange(organizationId: string) {
    const organization = organizations.find(
      (item) => item._id === organizationId,
    );

    if (!organization) {
      return;
    }

    setSelectedOrganization(organization);
    setSelectedCampus(null);
    setOpen(false);
    setView("campus");

    if (organization.slug !== currentOrganizationSlug) {
      const nextInternalHref = isCampusDetailRoute
        ? getTenantCanonicalHref(
            ROUTES.tenant.root(organization.slug),
            organization.slug,
          )
        : currentInternalHref;

      window.location.assign(
        getTenantHostUrl(organization.slug, locale, nextInternalHref),
      );
    }
  }

  function getCampusDetailInternalHref(campusSlug: string) {
    return getTenantCanonicalHref(
      ROUTES.tenant.campuses.detail(selectedOrganizationSlug, campusSlug),
      selectedOrganizationSlug,
    );
  }

  function handleCampusChange(nextCampusSlug: string) {
    setSelectedCampus(nextCampusSlug);
    setOpen(false);
    window.location.assign(
      getTenantHostUrl(
        selectedOrganizationSlug,
        locale,
        getCampusDetailInternalHref(nextCampusSlug),
      ),
    );
  }

  const currentCampus = currentCampusSlug
    ? (campuses.find((campus) => campus.slug === currentCampusSlug) ?? null)
    : null;
  const displayedCampusSlug = currentCampus?.slug ?? selectedCampus;
  const displayedCampusName = currentCampus?.name ?? null;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            navigationMenuTriggerStyle(),
            "max-w-72 cursor-pointer gap-2 px-2.5",
            "justify-between",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <OrganizationAvatar organization={selectedOrganization} />
            {isCampusDetailRoute && displayedCampusName ? (
              <>
                <span aria-hidden="true" className="text-muted-foreground">
                  /
                </span>
                <span className="truncate">{displayedCampusName}</span>
              </>
            ) : (
              <span className="truncate">{selectedOrganization.name}</span>
            )}
          </span>
          <HugeiconsIcon
            icon={UnfoldMoreIcon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64">
        {view === "campus" ? (
          <>
            <div className="flex items-center gap-1">
              <DropdownMenuItem
                className="flex-1 cursor-pointer justify-between border border-input bg-input/20 px-2 py-1.5 focus:bg-input/50"
                onSelect={(event) => {
                  event.preventDefault();
                  setView("institution");
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <OrganizationAvatar organization={selectedOrganization} />
                  <span className="truncate">{selectedOrganization.name}</span>
                </span>
                <HugeiconsIcon
                  icon={UnfoldMoreIcon}
                  strokeWidth={2}
                  className="size-3.5 text-muted-foreground"
                />
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className={cn(
                  "size-6 shrink-0 justify-center px-0 py-0 focus:bg-input/50",
                  isTeamSettingsRoute && "bg-accent text-accent-foreground",
                )}
              >
                <a
                  href={teamSettingsHref}
                  aria-label={t("teamSettings")}
                  title={t("teamSettings")}
                >
                  <HugeiconsIcon icon={Settings01Icon} className="size-4" />
                </a>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t("switcher.selectCampus")}
              </DropdownMenuLabel>
              {organizationCampuses === undefined && shouldLoadSwitcherData ? (
                <DropdownMenuItem disabled>
                  {t("actions.loading")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuRadioGroup
                  value={displayedCampusSlug ?? undefined}
                  onValueChange={handleCampusChange}
                >
                  {campuses.map((campus) => (
                    <DropdownMenuRadioItem
                      key={campus.slug}
                      value={campus.slug}
                      className="cursor-pointer"
                    >
                      {campus.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              )}
            </DropdownMenuGroup>
          </>
        ) : (
          <>
            <DropdownMenuItem
              className="cursor-pointer gap-2"
              onSelect={(event) => {
                event.preventDefault();
                setView("campus");
              }}
            >
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="rotate-180"
              />
              <span>{t("switcher.backToCampus")}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {t("switcher.selectInstitution")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={selectedOrganization._id}>
                {organizations.map((organization) => (
                  <DropdownMenuRadioItem
                    key={organization._id}
                    value={organization._id}
                    className="cursor-pointer"
                    onSelect={(event) => {
                      event.preventDefault();
                      handleOrganizationChange(organization._id);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <OrganizationAvatar organization={organization} />
                      <span className="truncate">{organization.name}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
