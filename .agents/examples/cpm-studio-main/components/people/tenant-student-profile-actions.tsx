"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { TenantGuardianAddChildDialog } from "@/components/people/tenant-guardian-add-child-dialog";
import { TenantPersonActionsMenu } from "@/components/people/tenant-person-actions-menu";
import type { TenantStudentProfile } from "@/components/people/tenant-people.types";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTenantPersonActiveState } from "@/hooks/people/use-tenant-person-active-state";
import { MAX_GUARDIAN_STUDENT_PROFILES } from "@/lib/people/academic-limits";

export function TenantStudentProfileActions({
  className,
  profile,
  slug,
}: {
  className?: string;
  profile: TenantStudentProfile;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const { setActive, settingActiveOrganizationPersonId } =
    useTenantPersonActiveState({ slug });
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const canManageChildren =
    profile.profileOwnerKind === "guardian" && profile.canManageProfile;
  const hasReachedChildLimit =
    profile.children.length >= MAX_GUARDIAN_STUDENT_PROFILES;

  return (
    <>
      <TenantPersonActionsMenu
        person={profile.person}
        trigger="button"
        className={className}
        contentClassName={canManageChildren ? "w-56" : undefined}
        isSetActiveDisabled={settingActiveOrganizationPersonId !== null}
        onSetActive={setActive}
      >
        {canManageChildren ? (
          <DropdownMenuItem
            className="justify-between"
            disabled={hasReachedChildLimit}
            onSelect={() => setIsAddChildOpen(true)}
          >
            <span>{t("profile.addChild")}</span>
            <Plus aria-hidden="true" className="size-4" />
          </DropdownMenuItem>
        ) : null}
      </TenantPersonActionsMenu>

      {canManageChildren ? (
        <TenantGuardianAddChildDialog
          guardianOrganizationPersonId={profile.person._id}
          open={isAddChildOpen}
          onOpenChange={setIsAddChildOpen}
          slug={slug}
        />
      ) : null}
    </>
  );
}
