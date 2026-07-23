"use client";

import { useTranslations } from "next-intl";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { ProfileIdentityFields } from "@/components/profile/profile-identity-fields";
import type { TenantOrganizationPerson } from "@/components/people/tenant-people.types";
import { useTenantOrganizationPersonProfileForm } from "@/hooks/people/use-tenant-organization-person-profile-form";

export function TenantAcademicPersonalInformationForm({
  fieldNamePrefix = "student",
  fieldPrefix = "student-profile",
  person,
  slug,
}: {
  fieldNamePrefix?: string;
  fieldPrefix?: string;
  person: TenantOrganizationPerson;
  slug: string;
}) {
  const commonT = useTranslations("Common");
  const form = useTenantOrganizationPersonProfileForm({ person, slug });

  return (
    <form className="flex flex-col gap-5" onSubmit={form.handleSubmit}>
      <ProfileIdentityFields
        avatarUrl={form.displayedAvatarUrl}
        avatarAlt={form.avatarAlt}
        avatarFallback={form.avatarFallback}
        isSaving={form.isSaving}
        canRemoveAvatar={form.canRemoveAvatar}
        onSelectAvatarFile={form.handleSelectAvatarFile}
        onRemoveAvatar={form.handleRemoveAvatar}
        firstName={form.firstName}
        lastName={form.lastName}
        onFirstNameChange={form.setFirstName}
        onLastNameChange={form.setLastName}
        firstNameId={`${fieldPrefix}-${person._id}-first-name`}
        lastNameId={`${fieldPrefix}-${person._id}-last-name`}
        firstNameName={`${fieldNamePrefix}FirstName`}
        lastNameName={`${fieldNamePrefix}LastName`}
        firstNameAutoComplete="off"
        lastNameAutoComplete="off"
        firstNameLabel={commonT("identity.firstNameLabel")}
        lastNameLabel={commonT("identity.lastNameLabel")}
        firstNamePlaceholder={commonT("identity.firstNamePlaceholder")}
        lastNamePlaceholder={commonT("identity.lastNamePlaceholder")}
        avatarClassName="size-14 rounded-2xl"
        avatarFallbackClassName="rounded-2xl text-sm font-semibold"
      />

      <ImageCropDialog
        open={!!form.imageCropSourceUrl}
        src={form.imageCropSourceUrl}
        fileName={form.imageCropFileName}
        onCancel={form.handleCancelAvatarCrop}
        onConfirm={form.handleConfirmAvatarCrop}
      />
    </form>
  );
}
