"use client";

import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import type { TenantStudentProfile } from "@/components/people/tenant-people.types";
import { TenantPersonActionsMenu } from "@/components/people/tenant-person-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type StudentProfileChild = TenantStudentProfile["children"][number];

export function TenantStudentChildActionsMenu({
  canManageChildren,
  child,
  isDeletePending,
  settingActiveOrganizationPersonId,
  onDeleteChild,
  onSetChildActive,
}: {
  canManageChildren: boolean;
  child: StudentProfileChild;
  isDeletePending: boolean;
  settingActiveOrganizationPersonId: Id<"organizationPeople"> | null;
  onDeleteChild: () => void | Promise<unknown>;
  onSetChildActive: (
    organizationPersonId: Id<"organizationPeople">,
    isActive: boolean,
  ) => void | Promise<unknown>;
}) {
  const t = useTranslations("TenantPeople");
  const hasActiveStateChangePending =
    settingActiveOrganizationPersonId !== null;
  const hasPendingAction = hasActiveStateChangePending || isDeletePending;

  return (
    <TenantPersonActionsMenu
      person={child.student}
      trigger="button"
      contentClassName="w-56"
      isSetActiveDisabled={!canManageChildren || hasPendingAction}
      onSetActive={onSetChildActive}
      footerActions={
        <DropdownMenuItem
          variant="destructive"
          className="justify-between"
          disabled={!canManageChildren || hasPendingAction}
          onClick={() => void onDeleteChild()}
        >
          <span>{t("profile.removeChild")}</span>
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            aria-hidden="true"
          />
        </DropdownMenuItem>
      }
    />
  );
}
