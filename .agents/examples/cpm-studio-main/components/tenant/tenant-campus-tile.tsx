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
import { useRouter, Link } from "@/i18n/navigation";
import { openContextMenuFromClick } from "@/lib/browser/context-menu";
import { ROUTES } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";

type TenantCampusTileCampus = {
  _id: Id<"campuses">;
  slug: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  href: string;
};

function TenantCampusTileContent({
  campus,
  tenantSlug,
}: {
  campus: TenantCampusTileCampus;
  tenantSlug: string;
}) {
  const t = useTranslations("TenantHome");

  return (
    <ResourceTileCard
      name={campus.name}
      imageUrl={campus.imageUrl}
      imageFallback="CA"
      metaText={ROUTES.tenant.campuses.detail(tenantSlug, campus.slug)}
      isActive={campus.isActive}
      statusLabel={campus.isActive ? t("active") : t("inactive")}
      goToAppLabel={
        campus.isActive ? t("openCampus") : t("campusActions.actions")
      }
    />
  );
}

export function TenantCampusTile({
  campus,
  canManage,
  tenantSlug,
}: {
  campus: TenantCampusTileCampus;
  canManage: boolean;
  tenantSlug: string;
}) {
  const { refresh } = useRouter();
  const t = useTranslations("TenantHome");
  const setCampusActive = useMutation(
    api.platform.campuses.setActiveForOrganization,
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
      activated: t("campusActions.activated"),
      deactivated: t("campusActions.deactivated"),
      error: t("genericError"),
    },
    onStatusChanged: refresh,
    setActive: async (nextIsActive) => {
      await setCampusActive({
        slug: tenantSlug,
        campusId: campus._id,
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
          {campus.isActive ? (
            <Link href={campus.href} className={triggerClassName}>
              <TenantCampusTileContent
                campus={campus}
                tenantSlug={tenantSlug}
              />
            </Link>
          ) : (
            <button
              type="button"
              aria-label={t("campusActions.open", { name: campus.name })}
              className={cn(triggerClassName, "w-full text-left")}
              onClick={openContextMenuFromClick}
            >
              <TenantCampusTileContent
                campus={campus}
                tenantSlug={tenantSlug}
              />
            </button>
          )}
        </ContextMenuTrigger>
        <ActiveStatusContextMenuContent
          canManage={canManage}
          isActive={campus.isActive}
          isPending={isPending}
          labels={{
            activate: t("campusActions.activate"),
            deactivate: t("campusActions.deactivate"),
          }}
          onSetActive={handleStatusChange}
        />
      </ContextMenu>
      <StatusDeactivationConfirmationDialog
        isPending={isPending}
        labels={{
          cancel: t("campusActions.deactivateDialog.cancel"),
          confirm: t("campusActions.deactivateDialog.confirm"),
          description: t("campusActions.deactivateDialog.description", {
            name: campus.name,
          }),
          title: t("campusActions.deactivateDialog.title"),
        }}
        onConfirm={confirmDeactivate}
        onOpenChange={setIsDeactivateDialogOpen}
        open={isDeactivateDialogOpen}
      />
    </>
  );
}
