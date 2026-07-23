"use client";

import { useTranslations } from "next-intl";
import { ImageUploadControl } from "@/components/files/image-upload-control";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ProfileIdentityFields({
  avatarUrl,
  avatarAlt,
  avatarFallback,
  isSaving,
  canRemoveAvatar,
  onSelectAvatarFile,
  onRemoveAvatar,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  canEditName = true,
  firstNameId,
  lastNameId,
  firstNameName = "firstName",
  lastNameName = "lastName",
  firstNameAutoComplete = "given-name",
  lastNameAutoComplete = "family-name",
  firstNameLabel,
  lastNameLabel,
  firstNamePlaceholder,
  lastNamePlaceholder,
  avatarClassName = "size-16 rounded-full border border-border/60",
  avatarFallbackClassName = "rounded-full text-sm font-semibold",
}: {
  avatarUrl: string | null;
  avatarAlt: string;
  avatarFallback: string;
  isSaving: boolean;
  canRemoveAvatar: boolean;
  onSelectAvatarFile: (file: File) => void;
  onRemoveAvatar: () => void;
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  canEditName?: boolean;
  firstNameId: string;
  lastNameId: string;
  firstNameName?: string;
  lastNameName?: string;
  firstNameAutoComplete?: string;
  lastNameAutoComplete?: string;
  firstNameLabel: string;
  lastNameLabel: string;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  avatarClassName?: string;
  avatarFallbackClassName?: string;
}) {
  const commonT = useTranslations("Common");

  return (
    <div className="flex flex-col gap-6">
      <ImageUploadControl
        imageUrl={avatarUrl}
        imageAlt={avatarAlt}
        imageFallback={avatarFallback}
        uploadLabel={commonT("imageUpload.upload")}
        removeLabel={commonT("imageUpload.remove")}
        requirementsText={commonT("imageUpload.requirements")}
        isSaving={isSaving}
        canRemoveImage={canRemoveAvatar}
        onSelectImageFile={onSelectAvatarFile}
        onRemoveImage={onRemoveAvatar}
        avatarClassName={avatarClassName}
        avatarFallbackClassName={avatarFallbackClassName}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-disabled={!canEditName ? true : undefined}>
          <FieldLabel htmlFor={firstNameId}>{firstNameLabel}</FieldLabel>
          <Input
            id={firstNameId}
            name={firstNameName}
            autoComplete={firstNameAutoComplete}
            value={firstName}
            onChange={(event) => onFirstNameChange(event.target.value)}
            placeholder={firstNamePlaceholder}
            disabled={isSaving || !canEditName}
          />
        </Field>
        <Field data-disabled={!canEditName ? true : undefined}>
          <FieldLabel htmlFor={lastNameId}>{lastNameLabel}</FieldLabel>
          <Input
            id={lastNameId}
            name={lastNameName}
            autoComplete={lastNameAutoComplete}
            value={lastName}
            onChange={(event) => onLastNameChange(event.target.value)}
            placeholder={lastNamePlaceholder}
            disabled={isSaving || !canEditName}
          />
        </Field>
      </div>
    </div>
  );
}
