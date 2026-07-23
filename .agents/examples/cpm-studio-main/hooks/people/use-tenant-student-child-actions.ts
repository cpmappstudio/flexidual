"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";
import { useTenantPersonActiveState } from "@/hooks/people/use-tenant-person-active-state";

function getDeleteChildErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "GUARDIAN_RELATIONSHIP_NOT_FOUND") {
    return t("errors.guardianRelationshipNotFound");
  }

  if (code === "ORGANIZATION_PERSON_HAS_LINKED_USER_ACCOUNT") {
    return t("errors.childHasLinkedUserAccount");
  }

  if (code === "ORGANIZATION_PERSON_HAS_ADDITIONAL_ROLES") {
    return t("errors.childHasAdditionalRoles");
  }

  return t("genericError");
}

export function useTenantStudentChildActions({ slug }: { slug: string }) {
  const t = useTranslations("TenantPeople");
  const deleteGuardianChild = useMutation(
    api.platform.people.deleteGuardianChild,
  );
  const { setActive, settingActiveOrganizationPersonId } =
    useTenantPersonActiveState({ slug });
  const [deletingRelationshipId, setDeletingRelationshipId] =
    useState<Id<"guardianRelationships"> | null>(null);

  async function deleteChild(
    guardianRelationshipId: Id<"guardianRelationships">,
  ) {
    if (deletingRelationshipId) {
      return false;
    }

    setDeletingRelationshipId(guardianRelationshipId);

    try {
      await deleteGuardianChild({ slug, guardianRelationshipId });
      toast.success(t("profile.childRemoved"));
      return true;
    } catch (error) {
      toast.error(getDeleteChildErrorMessage(t, error));
      return false;
    } finally {
      setDeletingRelationshipId(null);
    }
  }

  return {
    deleteChild,
    deletingRelationshipId,
    setChildActive: setActive,
    settingActiveOrganizationPersonId,
  };
}
