"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";

function getCampusAssignmentErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "CAMPUS_NOT_FOUND") {
    return t("academicCreateDialog.errors.campusNotFound");
  }

  if (code === "ORGANIZATION_PERSON_CAMPUS_ASSIGNMENT_LIMIT_EXCEEDED") {
    return t("profile.campusAssignmentLimitExceeded");
  }

  return t("genericError");
}

export function useTenantPersonCampusAssignments({ slug }: { slug: string }) {
  const t = useTranslations("TenantPeople");
  const assignToCampus = useMutation(
    api.platform.people.assignOrganizationPersonToCampus,
  );
  const removeFromCampus = useMutation(
    api.platform.people.removeOrganizationPersonFromCampus,
  );
  const [isAddingCampus, setIsAddingCampus] = useState(false);
  const [removingAssignmentId, setRemovingAssignmentId] =
    useState<Id<"organizationPersonCampusAssignments"> | null>(null);

  async function addCampus({
    campusId,
    organizationPersonId,
  }: {
    campusId: Id<"campuses">;
    organizationPersonId: Id<"organizationPeople">;
  }) {
    if (isAddingCampus) {
      return false;
    }

    setIsAddingCampus(true);

    try {
      await assignToCampus({
        slug,
        organizationPersonId,
        campusId,
      });
      toast.success(t("profile.campusAdded"));
      return true;
    } catch (error) {
      toast.error(getCampusAssignmentErrorMessage(t, error));
      return false;
    } finally {
      setIsAddingCampus(false);
    }
  }

  async function removeCampus({
    assignmentId,
    campusId,
    organizationPersonId,
  }: {
    assignmentId: Id<"organizationPersonCampusAssignments">;
    campusId: Id<"campuses">;
    organizationPersonId: Id<"organizationPeople">;
  }) {
    if (removingAssignmentId) {
      return;
    }

    setRemovingAssignmentId(assignmentId);

    try {
      await removeFromCampus({
        slug,
        organizationPersonId,
        campusId,
      });
      toast.success(t("profile.campusRemoved"));
    } catch (error) {
      toast.error(getCampusAssignmentErrorMessage(t, error));
    } finally {
      setRemovingAssignmentId(null);
    }
  }

  return {
    addCampus,
    isAddingCampus,
    removeCampus,
    removingAssignmentId,
  };
}
