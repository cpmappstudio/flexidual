"use client";

import { TenantPersonActionsMenu } from "@/components/people/tenant-person-actions-menu";
import type { TenantTeacherProfile } from "@/components/people/tenant-people.types";
import { useTenantPersonActiveState } from "@/hooks/people/use-tenant-person-active-state";

export function TenantTeacherProfileActions({
  className,
  profile,
  slug,
}: {
  className?: string;
  profile: TenantTeacherProfile;
  slug: string;
}) {
  const { setActive, settingActiveOrganizationPersonId } =
    useTenantPersonActiveState({ slug });

  return (
    <TenantPersonActionsMenu
      person={profile.person}
      trigger="button"
      className={className}
      isSetActiveDisabled={settingActiveOrganizationPersonId !== null}
      onSetActive={setActive}
    />
  );
}
