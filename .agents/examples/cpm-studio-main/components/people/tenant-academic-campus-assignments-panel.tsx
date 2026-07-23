"use client";

import { type FormEvent, useDeferredValue, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantCampusAssignmentsTable } from "@/components/people/tenant-campus-assignments-table";
import { TenantCampusSelect } from "@/components/people/tenant-campus-select";
import { TenantPeopleSearchField } from "@/components/people/tenant-people-search-field";
import { filterCampusAssignmentsBySearchQuery } from "@/components/people/tenant-people-utils";
import type {
  TenantAcademicCampusAssignment,
  TenantAcademicPersonProfile,
  TenantOrganizationPersonRole,
} from "@/components/people/tenant-people.types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenantPersonCampusAssignments } from "@/hooks/people/use-tenant-person-campus-assignments";

type AcademicCampusRole = Extract<
  TenantOrganizationPersonRole,
  "student" | "teacher"
>;

function getProfileCampusRole(
  profile: TenantAcademicPersonProfile,
): AcademicCampusRole {
  if (profile.profileOwnerKind === "teacher") {
    return "teacher";
  }

  if (
    profile.person.roles.includes("teacher") &&
    !profile.person.roles.includes("student")
  ) {
    return "teacher";
  }

  return "student";
}

type CampusAssignmentTarget = {
  _id: Id<"organizationPeople">;
  name: string;
};

function getCampusAssignmentTargets(
  profile: TenantAcademicPersonProfile,
): CampusAssignmentTarget[] {
  if (profile.profileOwnerKind === "guardian") {
    return profile.children.map(({ student }) => ({
      _id: student._id,
      name: student.name,
    }));
  }

  return [
    {
      _id: profile.person._id,
      name: profile.person.name,
    },
  ];
}

function getCampusAssignmentsForTarget(
  profile: TenantAcademicPersonProfile,
  organizationPersonId: Id<"organizationPeople">,
) {
  if (profile.profileOwnerKind === "guardian") {
    return (
      profile.children.find(
        ({ student }) => student._id === organizationPersonId,
      )?.campusAssignments ?? []
    );
  }

  return profile.campusAssignments;
}

function getDefaultCampusAssignmentTargetId(
  profile: TenantAcademicPersonProfile,
  targets: CampusAssignmentTarget[],
) {
  if (profile.profileOwnerKind !== "guardian") {
    return profile.person._id;
  }

  return (
    targets.find(
      (target) => target._id === profile.selectedStudentOrganizationPersonId,
    )?._id ??
    targets[0]?._id ??
    profile.selectedStudentOrganizationPersonId
  );
}

function AddCampusDialogContent({
  availableCampuses,
  isAddingCampus,
  isLoadingCampuses,
  onAddCampus,
  onTargetChange,
  selectedTargetId,
  showStudentSelect,
  targets,
}: {
  availableCampuses: Array<{ _id: Id<"campuses">; name: string }>;
  isAddingCampus: boolean;
  isLoadingCampuses: boolean;
  onAddCampus: (campusId: Id<"campuses">) => Promise<boolean>;
  onTargetChange: (organizationPersonId: Id<"organizationPeople">) => void;
  selectedTargetId: Id<"organizationPeople">;
  showStudentSelect: boolean;
  targets: CampusAssignmentTarget[];
}) {
  const t = useTranslations("TenantPeople");
  const [selectedCampusId, setSelectedCampusId] = useState<Id<"campuses"> | "">(
    "",
  );
  const hasAvailableCampuses = availableCampuses.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCampusId || isAddingCampus) {
      return;
    }

    const wasAdded = await onAddCampus(selectedCampusId);
    if (wasAdded) {
      setSelectedCampusId("");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="-mx-4 grid max-h-[50vh] gap-4 overflow-y-auto px-4">
        {showStudentSelect ? (
          <Field>
            <FieldLabel htmlFor="add-campus-assignment-student">
              {t("profile.studentLabel")}
            </FieldLabel>
            <Select
              value={selectedTargetId}
              onValueChange={(nextTargetId) => {
                setSelectedCampusId("");
                onTargetChange(nextTargetId as Id<"organizationPeople">);
              }}
            >
              <SelectTrigger
                id="add-campus-assignment-student"
                className="w-full"
              >
                <SelectValue placeholder={t("profile.selectStudent")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {targets.map((target) => (
                    <SelectItem key={target._id} value={target._id}>
                      {target.name || t("table.unnamedPerson")}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="add-campus-assignment">
            {t("profile.campusLabel")}
          </FieldLabel>
          <TenantCampusSelect
            triggerId="add-campus-assignment"
            value={selectedCampusId}
            campuses={availableCampuses}
            disabled={isLoadingCampuses || !hasAvailableCampuses}
            placeholder={
              isLoadingCampuses
                ? t("academicCreateDialog.loadingCampuses")
                : t("profile.selectCampus")
            }
            onValueChange={setSelectedCampusId}
          />
        </Field>

        {!isLoadingCampuses && !hasAvailableCampuses ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("profile.noAvailableCampuses")}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mt-6">
        <Button
          type="submit"
          disabled={
            !selectedCampusId || isAddingCampus || !hasAvailableCampuses
          }
        >
          {isAddingCampus ? t("profile.addingCampus") : t("profile.addCampus")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TenantAcademicCampusAssignmentsPanel({
  profile,
  slug,
}: {
  profile: TenantAcademicPersonProfile;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedAddTargetId, setSelectedAddTargetId] =
    useState<Id<"organizationPeople"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const campuses = useQuery(
    api.platform.campuses.listForOrganization,
    addDialogOpen ? { slug } : "skip",
  );
  const { addCampus, isAddingCampus, removeCampus, removingAssignmentId } =
    useTenantPersonCampusAssignments({ slug });
  const assignmentTargets = getCampusAssignmentTargets(profile);
  const defaultAssignmentTargetId = getDefaultCampusAssignmentTargetId(
    profile,
    assignmentTargets,
  );
  const effectiveSelectedAddTargetId =
    selectedAddTargetId &&
    assignmentTargets.some((target) => target._id === selectedAddTargetId)
      ? selectedAddTargetId
      : defaultAssignmentTargetId;
  const selectedTargetCampusAssignments = getCampusAssignmentsForTarget(
    profile,
    effectiveSelectedAddTargetId,
  );
  const assignedCampusIds = new Set(
    selectedTargetCampusAssignments.map(({ campus }) => campus._id),
  );
  const availableCampuses = (campuses ?? []).filter(
    (campus) => !assignedCampusIds.has(campus._id),
  );
  const campusRole = getProfileCampusRole(profile);
  const canManageCampuses = profile.canManageProfile;
  const filteredCampusAssignments = filterCampusAssignmentsBySearchQuery(
    profile.campusAssignments,
    deferredSearchQuery,
  );
  const isSearching = deferredSearchQuery.trim().length > 0;

  async function handleAddCampus(campusId: Id<"campuses">) {
    const wasAdded = await addCampus({
      campusId,
      organizationPersonId: effectiveSelectedAddTargetId,
    });
    if (wasAdded) {
      setAddDialogOpen(false);
      setSelectedAddTargetId(null);
    }

    return wasAdded;
  }

  function handleRemoveCampus(assignment: TenantAcademicCampusAssignment) {
    removeCampus({
      assignmentId: assignment.assignment._id,
      campusId: assignment.campus._id,
      organizationPersonId: assignment.assignment.organizationPersonId,
    });
  }

  return (
    <Dialog
      open={addDialogOpen}
      onOpenChange={(nextOpen) => {
        setAddDialogOpen(nextOpen);
        if (!nextOpen) {
          setSelectedAddTargetId(null);
        }
      }}
    >
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TenantPeopleSearchField
            ariaLabel={t("filters.search")}
            name="tenant-profile-campus-search"
            placeholder={t("filters.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          {canManageCampuses ? (
            <DialogTrigger asChild>
              <Button type="button">{t("profile.addToCampus")}</Button>
            </DialogTrigger>
          ) : null}
        </div>

        <TenantCampusAssignmentsTable
          assignments={filteredCampusAssignments}
          campusRole={campusRole}
          canManageCampuses={canManageCampuses}
          emptyLabel={
            isSearching
              ? t("profile.campusesTable.noSearchResults")
              : t("profile.noCampuses")
          }
          removingAssignmentId={removingAssignmentId}
          variant={
            profile.profileOwnerKind === "guardian"
              ? "guardianStudents"
              : "singleProfile"
          }
          removeCampusAction={handleRemoveCampus}
        />
      </section>

      <DialogContent className="max-w-md rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle>{t("profile.addToCampus")}</DialogTitle>
        </DialogHeader>
        <AddCampusDialogContent
          availableCampuses={availableCampuses}
          isAddingCampus={isAddingCampus}
          isLoadingCampuses={addDialogOpen && campuses === undefined}
          selectedTargetId={effectiveSelectedAddTargetId}
          showStudentSelect={profile.profileOwnerKind === "guardian"}
          targets={assignmentTargets}
          onTargetChange={setSelectedAddTargetId}
          onAddCampus={handleAddCampus}
        />
      </DialogContent>
    </Dialog>
  );
}
