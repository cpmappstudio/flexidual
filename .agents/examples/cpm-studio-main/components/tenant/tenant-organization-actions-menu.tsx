"use client";

import { useMutation } from "convex/react";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useActiveStatusToggle } from "@/hooks/use-active-status-toggle";
import type { AppLocale } from "@/i18n/routing";
import { ActiveStatusDropdownMenuContent } from "@/components/status/active-status-actions";
import { StatusDeactivationConfirmationDialog } from "@/components/status/status-deactivation-confirmation-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/lib/navigation/routes";
import { getRootHostUrl } from "@/lib/tenancy/domain";
import { cn } from "@/lib/utils";

export function TenantOrganizationActionsMenu({
  canDeactivate,
  className,
  isActive,
  slug,
}: {
  canDeactivate: boolean;
  className?: string;
  isActive: boolean;
  slug: string;
}) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("TenantTeam");
  const deactivateOrganization = useMutation(
    api.organizations.deactivateForOrganization,
  );
  const {
    confirmDeactivate,
    handleStatusChange,
    isDeactivateDialogOpen,
    isPending,
    setIsDeactivateDialogOpen,
  } = useActiveStatusToggle({
    canManage: canDeactivate,
    messages: {
      activated: t("organizationActions.activated"),
      deactivated: t("organizationActions.deactivated"),
      error: t("genericError"),
    },
    onStatusChanged: (nextIsActive) => {
      if (!nextIsActive) {
        window.location.assign(getRootHostUrl(locale, ROUTES.institutions.root));
      }
    },
    setActive: async (nextIsActive) => {
      if (nextIsActive) {
        return;
      }

      await deactivateOrganization({ slug });
    },
  });

  function handleOrganizationStatusChange(nextIsActive: boolean) {
    if (nextIsActive) {
      return;
    }

    handleStatusChange(nextIsActive);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" className={cn("shrink-0", className)}>
            {t("organizationActions.actions")}
            <ChevronDown aria-hidden="true" data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <ActiveStatusDropdownMenuContent
          canManage={canDeactivate}
          isActive={isActive}
          isPending={isPending}
          labels={{
            activate: t("organizationActions.activate"),
            deactivate: t("organizationActions.deactivate"),
          }}
          onSetActive={handleOrganizationStatusChange}
        />
      </DropdownMenu>
      <StatusDeactivationConfirmationDialog
        isPending={isPending}
        labels={{
          cancel: t("organizationActions.deactivateDialog.cancel"),
          confirm: t("organizationActions.deactivateDialog.confirm"),
          description: t("organizationActions.deactivateDialog.description"),
          title: t("organizationActions.deactivateDialog.title"),
        }}
        onConfirm={confirmDeactivate}
        onOpenChange={setIsDeactivateDialogOpen}
        open={isDeactivateDialogOpen}
      />
    </>
  );
}
