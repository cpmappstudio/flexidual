"use client";

import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { ResourceTileCard } from "@/components/resources/resource-tile-card";
import { ActiveStatusContextMenuContent } from "@/components/status/active-status-actions";
import { StatusDeactivationConfirmationDialog } from "@/components/status/status-deactivation-confirmation-dialog";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useActiveStatusToggle } from "@/hooks/use-active-status-toggle";
import type { AppLocale } from "@/i18n/routing";
import { openContextMenuFromClick } from "@/lib/browser/context-menu";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantHostUrl } from "@/lib/tenancy/domain";
import { cn } from "@/lib/utils";

type PlatformOrganization = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  imageUrl?: string;
  isActive: boolean;
};

function PlatformOrganizationTileContent({
  organization,
  rootDomain,
}: {
  organization: PlatformOrganization;
  rootDomain: string;
}) {
  const t = useTranslations("PlatformAdmin");

  return (
    <ResourceTileCard
      name={organization.name}
      imageUrl={organization.imageUrl ?? null}
      imageFallback="OR"
      metaText={`${organization.slug}.${rootDomain}`}
      isActive={organization.isActive}
      statusLabel={organization.isActive ? t("active") : t("inactive")}
      goToAppLabel={
        organization.isActive ? t("goToApp") : t("organizationActions.actions")
      }
    />
  );
}

export function PlatformOrganizationTile({
  canManage,
  locale,
  organization,
  rootDomain,
}: {
  canManage: boolean;
  locale: AppLocale;
  organization: PlatformOrganization;
  rootDomain: string;
}) {
  const t = useTranslations("PlatformAdmin");
  const setOrganizationActive = useMutation(
    api.organizations.setActiveForPlatform,
  );
  const {
    confirmDeactivate,
    handleStatusChange,
    isDeactivateDialogOpen,
    isPending,
    setIsDeactivateDialogOpen,
  } = useActiveStatusToggle({
    canManage,
    messages: {
      activated: t("organizationActions.activated"),
      deactivated: t("organizationActions.deactivated"),
      error: t("genericError"),
    },
    setActive: async (nextIsActive) => {
      await setOrganizationActive({
        organizationId: organization._id,
        isActive: nextIsActive,
      });
    },
  });

  const triggerClassName = cn(
    "group block h-full rounded-3xl touch-manipulation",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {organization.isActive ? (
            <a
              href={getTenantHostUrl(
                organization.slug,
                locale,
                ROUTES.tenant.root(organization.slug),
              )}
              className={triggerClassName}
            >
              <PlatformOrganizationTileContent
                organization={organization}
                rootDomain={rootDomain}
              />
            </a>
          ) : (
            <button
              type="button"
              aria-label={t("organizationActions.open", {
                name: organization.name,
              })}
              className={cn(triggerClassName, "w-full text-left")}
              onClick={openContextMenuFromClick}
            >
              <PlatformOrganizationTileContent
                organization={organization}
                rootDomain={rootDomain}
              />
            </button>
          )}
        </ContextMenuTrigger>
        <ActiveStatusContextMenuContent
          canManage={canManage}
          isActive={organization.isActive}
          isPending={isPending}
          labels={{
            activate: t("organizationActions.activate"),
            deactivate: t("organizationActions.deactivate"),
          }}
          onSetActive={handleStatusChange}
        />
      </ContextMenu>
      <StatusDeactivationConfirmationDialog
        isPending={isPending}
        labels={{
          cancel: t("organizationActions.deactivateDialog.cancel"),
          confirm: t("organizationActions.deactivateDialog.confirm"),
          description: t("organizationActions.deactivateDialog.description", {
            name: organization.name,
          }),
          title: t("organizationActions.deactivateDialog.title"),
        }}
        onConfirm={confirmDeactivate}
        onOpenChange={setIsDeactivateDialogOpen}
        open={isDeactivateDialogOpen}
      />
    </>
  );
}
