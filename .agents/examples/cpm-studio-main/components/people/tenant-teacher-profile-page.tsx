"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { TenantAcademicCampusAssignmentsPanel } from "@/components/people/tenant-academic-campus-assignments-panel";
import {
  TenantAcademicPersonProfileShell,
  TenantAcademicPersonProfileSkeleton,
} from "@/components/people/tenant-academic-person-profile-shell";
import { TenantTeacherProfileActions } from "@/components/people/tenant-teacher-profile-actions";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ROUTES } from "@/lib/navigation/routes";

export function TenantTeacherProfilePage({
  slug,
  organizationPersonId,
}: {
  slug: string;
  organizationPersonId: Id<"organizationPeople">;
}) {
  const t = useTranslations("TenantPeople");
  const profile = useQuery(api.platform.people.getTeacherProfile, {
    slug,
    organizationPersonId,
  });

  if (!profile) {
    return <TenantAcademicPersonProfileSkeleton />;
  }

  return (
    <TenantAcademicPersonProfileShell
      accountSelfLabel={t("table.teacherProfile")}
      actions={
        <TenantTeacherProfileActions
          profile={profile}
          slug={slug}
          className="w-full sm:w-auto"
        />
      }
      avatarFallback="TE"
      backHref={ROUTES.tenant.academicManagementSections.teachers(slug)}
      backLabel={t("profile.backToTeachers")}
      campusesTab={
        <TenantAcademicCampusAssignmentsPanel profile={profile} slug={slug} />
      }
      fieldNamePrefix="teacher"
      fieldPrefix="teacher-profile"
      profile={profile}
      profileRoleLabel={t("roles.teacher")}
      slug={slug}
    />
  );
}
