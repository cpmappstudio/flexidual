"use client";

import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { ProfileIdentityFields } from "@/components/profile/profile-identity-fields";
import type { ProfileCurrentUser } from "@/components/profile/types";
import { useProfileAvatarDraft } from "@/components/profile/use-profile-avatar-draft";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  getImageFallbackLabel,
  getImageUploadErrorMessage,
} from "@/lib/files/image";
import { getErrorCode } from "@/lib/convex-errors";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";

export function ProfileDetailsForm({
  currentUser,
  formId,
  onStateChange,
}: {
  currentUser: ProfileCurrentUser;
  formId?: string;
  onStateChange?: (state: { hasChanges: boolean; isSaving: boolean }) => void;
}) {
  const t = useTranslations("ProfileSettings");
  const commonT = useTranslations("Common");
  const saveProfile = useMutation(api.users.saveProfile);
  const generateAvatarUploadUrl = useMutation(
    api.users.generateAvatarUploadUrl,
  );
  const discardAvatarUpload = useMutation(api.users.discardAvatarUpload);
  const canEditProfileName = currentUser.canEditProfileName;

  const [firstName, setFirstName] = useState(currentUser.firstName);
  const [lastName, setLastName] = useState(currentUser.lastName);
  const [isSaving, setIsSaving] = useState(false);
  const {
    selectedAvatarFile,
    avatarCropSourceUrl,
    avatarCropFileName,
    shouldRemoveAvatar,
    displayedAvatarUrl,
    canRemoveAvatar,
    hasPendingAvatarChanges,
    handleSelectAvatarFile,
    handleCancelAvatarCrop,
    handleConfirmAvatarCrop,
    handleRemoveAvatar,
    clearAvatarDraft,
  } = useProfileAvatarDraft(currentUser);

  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const hasNameChanges =
    canEditProfileName &&
    (normalizedFirstName !== currentUser.firstName ||
      normalizedLastName !== currentUser.lastName);
  const avatarChange = selectedAvatarFile
    ? "set"
    : shouldRemoveAvatar
      ? "remove"
      : "keep";
  const hasChanges = hasNameChanges || hasPendingAvatarChanges;
  const avatarAlt =
    [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ") ||
    currentUser.email ||
    "User";
  const avatarFallback = getImageFallbackLabel({
    name: currentUser.name,
    firstName,
    lastName,
    email: currentUser.email,
  });

  useEffect(() => {
    onStateChange?.({ hasChanges, isSaving });
  }, [hasChanges, isSaving, onStateChange]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || !hasChanges) {
      return;
    }

    if (canEditProfileName && !normalizedFirstName && !normalizedLastName) {
      toast.error(commonT("identity.nameRequired"));
      return;
    }

    setIsSaving(true);
    let uploadedStorageId: Id<"_storage"> | null = null;

    try {
      uploadedStorageId = await uploadStorageFileDraft({
        file: selectedAvatarFile,
        generateUploadUrl: generateAvatarUploadUrl,
      });

      await saveProfile({
        firstName: canEditProfileName ? firstName : currentUser.firstName,
        lastName: canEditProfileName ? lastName : currentUser.lastName,
        avatarChange:
          uploadedStorageId !== null
            ? {
                kind: "set",
                storageId: uploadedStorageId,
              }
            : avatarChange === "remove"
              ? { kind: "remove" }
              : { kind: "keep" },
      });

      clearAvatarDraft();
      toast.success(t("profileSaved"));
    } catch (updateError) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: discardAvatarUpload,
      });

      const errorCode = getErrorCode(updateError);
      const message =
        errorCode === "PROFILE_NAME_REQUIRED"
          ? commonT("identity.nameRequired")
          : getImageUploadErrorMessage({
              errorCode,
              invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
              tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
              uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
              fallbackMessage: t("genericError"),
            });
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form id={formId} className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <ProfileIdentityFields
        avatarUrl={displayedAvatarUrl}
        avatarAlt={avatarAlt}
        avatarFallback={avatarFallback}
        isSaving={isSaving || !!avatarCropSourceUrl}
        canRemoveAvatar={canRemoveAvatar}
        onSelectAvatarFile={handleSelectAvatarFile}
        onRemoveAvatar={handleRemoveAvatar}
        firstName={firstName}
        lastName={lastName}
        onFirstNameChange={setFirstName}
        onLastNameChange={setLastName}
        canEditName={canEditProfileName}
        firstNameId="profile-first-name"
        lastNameId="profile-last-name"
        firstNameLabel={commonT("identity.firstNameLabel")}
        lastNameLabel={commonT("identity.lastNameLabel")}
        firstNamePlaceholder={commonT("identity.firstNamePlaceholder")}
        lastNamePlaceholder={commonT("identity.lastNamePlaceholder")}
      />

      <FieldGroup>
        <Field data-disabled>
          <FieldLabel htmlFor="profile-email">{t("emailLabel")}</FieldLabel>
          <Input
            id="profile-email"
            value={currentUser.email ?? ""}
            disabled
            readOnly
          />
          <FieldDescription>{t("emailDescription")}</FieldDescription>
        </Field>
        <Field data-disabled>
          <FieldLabel htmlFor="profile-phone">{t("phoneLabel")}</FieldLabel>
          <Input
            id="profile-phone"
            value={currentUser.phone ?? ""}
            disabled
            readOnly
            placeholder={t("phonePlaceholder")}
          />
          <FieldDescription>{t("phoneDescription")}</FieldDescription>
        </Field>
      </FieldGroup>

      <ImageCropDialog
        open={!!avatarCropSourceUrl}
        src={avatarCropSourceUrl}
        fileName={avatarCropFileName}
        onCancel={handleCancelAvatarCrop}
        onConfirm={handleConfirmAvatarCrop}
      />
    </form>
  );
}
