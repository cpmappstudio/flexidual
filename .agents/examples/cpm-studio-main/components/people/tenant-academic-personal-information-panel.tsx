"use client";

import { useTranslations } from "next-intl";
import { TenantAcademicPersonalInformationForm } from "@/components/people/tenant-academic-personal-information-form";
import { TenantAcademicProfilePanel as ProfilePanel } from "@/components/people/tenant-academic-profile-panel";
import type { TenantOrganizationPerson } from "@/components/people/tenant-people.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";

export function TenantAcademicPersonalInformationPanel({
  avatarFallback = "ST",
  canManageProfile,
  fieldNamePrefix = "student",
  fieldPrefix = "student-profile",
  person,
  roleLabel,
  slug,
}: {
  avatarFallback?: string;
  canManageProfile: boolean;
  fieldNamePrefix?: string;
  fieldPrefix?: string;
  person: TenantOrganizationPerson;
  roleLabel?: string;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const effectiveRoleLabel = roleLabel ?? t("roles.student");
  const firstNameId = `${fieldPrefix}-${person._id}-readonly-first-name`;
  const lastNameId = `${fieldPrefix}-${person._id}-readonly-last-name`;
  const displayName = person.name || t("table.unnamedPerson");

  return (
    <ProfilePanel title={t("profile.personalInformation")}>
      {canManageProfile ? (
        <TenantAcademicPersonalInformationForm
          fieldNamePrefix={fieldNamePrefix}
          fieldPrefix={fieldPrefix}
          person={person}
          slug={slug}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar className="size-14 rounded-2xl">
              <AvatarImage
                src={getOptionalImageSrc(person.avatarUrl)}
                alt={displayName}
              />
              <AvatarFallback className="rounded-2xl text-sm font-semibold">
                {getInitials(displayName, avatarFallback)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {displayName}
              </p>
              <p className="text-sm text-muted-foreground">
                {effectiveRoleLabel}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={firstNameId}>
                {t("createDialog.firstNameLabel")}
              </FieldLabel>
              <Input
                id={firstNameId}
                name={`${fieldNamePrefix}FirstName`}
                autoComplete="off"
                value={person.firstName ?? ""}
                readOnly
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={lastNameId}>
                {t("createDialog.lastNameLabel")}
              </FieldLabel>
              <Input
                id={lastNameId}
                name={`${fieldNamePrefix}LastName`}
                autoComplete="off"
                value={person.lastName ?? ""}
                readOnly
              />
            </Field>
          </div>
        </div>
      )}
    </ProfilePanel>
  );
}
