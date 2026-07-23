"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantOrganizationPersonActivityPanel } from "@/components/people/tenant-organization-person-activity-panel";
import { TenantStudentChildActionsMenu } from "@/components/people/tenant-student-child-actions-menu";
import { TenantAcademicPersonalInformationPanel } from "@/components/people/tenant-academic-personal-information-panel";
import { TenantAcademicProfilePanel as ProfilePanel } from "@/components/people/tenant-academic-profile-panel";
import type { TenantStudentProfile } from "@/components/people/tenant-people.types";
import { StatusDeactivationConfirmationDialog } from "@/components/status/status-deactivation-confirmation-dialog";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "@/i18n/navigation";
import { useTenantOrganizationPersonActivity } from "@/hooks/people/use-tenant-organization-person-activity";
import { useTenantStudentChildActions } from "@/hooks/people/use-tenant-student-child-actions";
import { ROUTES } from "@/lib/navigation/routes";

type StudentProfileChild = TenantStudentProfile["children"][number];

function StudentChildActivityPanel({
  organizationPersonId,
  personCreatedAt,
  slug,
}: {
  organizationPersonId: Id<"organizationPeople">;
  personCreatedAt: number;
  slug: string;
}) {
  const activityState = useTenantOrganizationPersonActivity({
    organizationPersonId,
    personCreatedAt,
    slug,
  });

  return (
    <TenantOrganizationPersonActivityPanel
      activityDays={activityState.activityDays}
      onYearChange={activityState.setSelectedYear}
      selectedYear={activityState.selectedYear}
      yearOptions={activityState.yearOptions}
    />
  );
}

function StudentChildHeader({ child }: { child: StudentProfileChild }) {
  const t = useTranslations("TenantPeople");
  const student = child.student;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
        {student.name || t("table.unnamedPerson")}
      </h2>
      {!student.isActive ? (
        <Badge variant="outline" className="shrink-0 rounded-full">
          {t("status.inactive")}
        </Badge>
      ) : null}
    </div>
  );
}

export function TenantStudentChildrenPanel({
  profile,
  slug,
}: {
  profile: TenantStudentProfile;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const { replace } = useRouter();
  const childActions = useTenantStudentChildActions({ slug });
  const [childPendingDeletion, setChildPendingDeletion] =
    useState<StudentProfileChild | null>(null);

  async function confirmDeleteChild() {
    if (!childPendingDeletion) {
      return;
    }

    const wasDeleted = await childActions.deleteChild(
      childPendingDeletion.relationship._id,
    );

    if (wasDeleted) {
      if (
        childPendingDeletion.student._id ===
        profile.selectedStudentOrganizationPersonId
      ) {
        const nextChild = profile.children.find(
          (child) =>
            child.relationship._id !== childPendingDeletion.relationship._id,
        );

        replace(
          nextChild
            ? `${ROUTES.tenant.academicManagementSections.students(slug)}/${nextChild.student._id}`
            : ROUTES.tenant.academicManagementSections.students(slug),
        );
      }

      setChildPendingDeletion(null);
    }
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (!open) {
      setChildPendingDeletion(null);
    }
  }

  if (profile.children.length === 0) {
    return (
      <ProfilePanel title={t("profile.tabs.children")}>
        <p className="text-sm text-muted-foreground">
          {t("profile.noChildren")}
        </p>
      </ProfilePanel>
    );
  }

  return (
    <section className="grid gap-10">
      {profile.children.map((child) => (
        <section
          key={child.relationship._id}
          className="grid gap-4 border-t border-border/70 pt-8 first:border-t-0 first:pt-0"
        >
          <header className="flex min-w-0 items-start justify-between gap-3">
            <StudentChildHeader child={child} />
            <TenantStudentChildActionsMenu
              canManageChildren={profile.canManageProfile}
              child={child}
              isDeletePending={childActions.deletingRelationshipId !== null}
              settingActiveOrganizationPersonId={
                childActions.settingActiveOrganizationPersonId
              }
              onDeleteChild={() => setChildPendingDeletion(child)}
              onSetChildActive={childActions.setChildActive}
            />
          </header>
          <div className="grid min-w-0 gap-6">
            <StudentChildActivityPanel
              organizationPersonId={child.student._id}
              personCreatedAt={child.student.createdAt}
              slug={slug}
            />
            <TenantAcademicPersonalInformationPanel
              canManageProfile={profile.canManageProfile}
              person={child.student}
              slug={slug}
            />
          </div>
        </section>
      ))}
      <StatusDeactivationConfirmationDialog
        isPending={childActions.deletingRelationshipId !== null}
        labels={{
          cancel: t("profile.removeChildDialog.cancel"),
          confirm: t("profile.removeChildDialog.confirm"),
          description: t("profile.removeChildDialog.description", {
            name:
              childPendingDeletion?.student.name || t("table.unnamedPerson"),
          }),
          title: t("profile.removeChildDialog.title"),
        }}
        onConfirm={confirmDeleteChild}
        onOpenChange={handleDeleteDialogOpenChange}
        open={childPendingDeletion !== null}
      />
    </section>
  );
}
