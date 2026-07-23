"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";

function getSetActiveErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  error: unknown,
) {
  const code = getErrorCode(error);
  if (!code) {
    return t("genericError");
  }

  if (code === "ORGANIZATION_PERSON_NOT_FOUND") {
    return t("errors.personNotFound");
  }

  return t("genericError");
}

export function useTenantPersonActiveState({ slug }: { slug: string }) {
  const t = useTranslations("TenantPeople");
  const deactivateOrganizationPerson = useMutation(
    api.platform.people.deactivateOrganizationPerson,
  );
  const reactivateOrganizationPerson = useMutation(
    api.platform.people.reactivateOrganizationPerson,
  );
  const [
    settingActiveOrganizationPersonId,
    setSettingActiveOrganizationPersonId,
  ] = useState<Id<"organizationPeople"> | null>(null);

  async function setActive(
    organizationPersonId: Id<"organizationPeople">,
    isActive: boolean,
  ) {
    if (settingActiveOrganizationPersonId) {
      return false;
    }

    setSettingActiveOrganizationPersonId(organizationPersonId);

    try {
      if (isActive) {
        await reactivateOrganizationPerson({ slug, organizationPersonId });
        toast.success(t("table.reactivated"));
      } else {
        await deactivateOrganizationPerson({ slug, organizationPersonId });
        toast.success(t("table.deactivated"));
      }
      return true;
    } catch (error) {
      toast.error(getSetActiveErrorMessage(t, error));
      return false;
    } finally {
      setSettingActiveOrganizationPersonId(null);
    }
  }

  return { setActive, settingActiveOrganizationPersonId };
}
