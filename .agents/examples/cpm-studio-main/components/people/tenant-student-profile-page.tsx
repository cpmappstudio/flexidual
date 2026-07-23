"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { TenantAcademicCampusAssignmentsPanel } from "@/components/people/tenant-academic-campus-assignments-panel";
import {
  TenantAcademicPersonProfileShell,
  TenantAcademicPersonProfileSkeleton,
} from "@/components/people/tenant-academic-person-profile-shell";
import { TenantStudentChildrenPanel } from "@/components/people/tenant-student-children-panel";
import { TenantStudentProfileActions } from "@/components/people/tenant-student-profile-actions";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ROUTES } from "@/lib/navigation/routes";

export function TenantStudentProfilePage({
  slug,
  organizationPersonId,
}: {
  slug: string;
  organizationPersonId: Id<"organizationPeople">;
}) {
  const t = useTranslations("TenantPeople");
  const profile = useQuery(api.platform.people.getStudentProfile, {
    slug,
    organizationPersonId,
  });

  if (!profile) {
    return <TenantAcademicPersonProfileSkeleton />;
  }

  return (
    <TenantAcademicPersonProfileShell
      accountSelfLabel={t("table.studentProfile")}
      actions={
        <TenantStudentProfileActions
          profile={profile}
          slug={slug}
          className="w-full sm:w-auto"
        />
      }
      avatarFallback="ST"
      backHref={ROUTES.tenant.academicManagementSections.students(slug)}
      backLabel={t("profile.backToStudents")}
      campusesTab={
        <TenantAcademicCampusAssignmentsPanel profile={profile} slug={slug} />
      }
      childrenTab={
        profile.profileOwnerKind === "guardian" ? (
          <TenantStudentChildrenPanel profile={profile} slug={slug} />
        ) : undefined
      }
      fieldNamePrefix="student"
      fieldPrefix="student-profile"
      profile={profile}
      profileRoleLabel={t("roles.student")}
      slug={slug}
    />
  );
}
