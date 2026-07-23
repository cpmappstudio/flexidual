"use client";

import { type FormEvent, useEffect, useEffectEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantUnsavedChangesToast } from "@/components/people/tenant-unsaved-changes-toast";
import type { TenantOrganizationPerson } from "@/components/people/tenant-people.types";
import { getErrorCode } from "@/lib/convex-errors";
import {
  getImageFallbackLabel,
  getImageUploadErrorMessage,
} from "@/lib/files/image";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";
import { useRemovableImageUploadDraft } from "@/hooks/use-removable-image-upload-draft";

const UNSAVED_PERSON_PROFILE_TOAST_ID_PREFIX =
  "tenant-person-profile-unsaved";

function getProfileUpdateErrorMessage({
  commonT,
  error,
  t,
}: {
  commonT: ReturnType<typeof useTranslations<"Common">>;
  error: unknown;
  t: ReturnType<typeof useTranslations<"TenantPeople">>;
}) {
  const errorCode = getErrorCode(error);

  if (errorCode === "PROFILE_NAME_REQUIRED") {
    return commonT("identity.nameRequired");
  }

  return getImageUploadErrorMessage({
    errorCode,
    invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
    tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
    uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
    fallbackMessage: t("genericError"),
  });
}

function getNormalizedPersonNameParts(person: TenantOrganizationPerson) {
  return {
    firstName: person.firstName ?? "",
    lastName: person.lastName ?? "",
  };
}

export function useTenantOrganizationPersonProfileForm({
  person,
  slug,
}: {
  person: TenantOrganizationPerson;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const commonT = useTranslations("Common");
  const updateOrganizationPersonProfile = useMutation(
    api.platform.people.updateOrganizationPersonProfile,
  );
  const generateImageUploadUrl = useMutation(
    api.platform.academicPeople.generateImageUploadUrl,
  );
  const discardImageUpload = useMutation(
    api.platform.academicPeople.discardImageUpload,
  );
  const initialNameParts = getNormalizedPersonNameParts(person);
  const [baselineFirstName, setBaselineFirstName] = useState(
    initialNameParts.firstName,
  );
  const [baselineLastName, setBaselineLastName] = useState(
    initialNameParts.lastName,
  );
  const [firstName, setFirstName] = useState(initialNameParts.firstName);
  const [lastName, setLastName] = useState(initialNameParts.lastName);
  const [isSaving, setIsSaving] = useState(false);
  const imageDraft = useRemovableImageUploadDraft({
    imageUrl: person.avatarUrl,
    hasRemovableImage: person.avatarUrl !== null,
  });

  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const hasNameChanges =
    normalizedFirstName !== baselineFirstName ||
    normalizedLastName !== baselineLastName;
  const hasChanges = hasNameChanges || imageDraft.hasPendingImageChanges;
  const avatarAlt =
    [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ") ||
    person.name ||
    t("table.unnamedPerson");
  const avatarFallback = getImageFallbackLabel({
    name: person.name,
    firstName,
    lastName,
    fallback: "ST",
  });
  const unsavedToastId = `${UNSAVED_PERSON_PROFILE_TOAST_ID_PREFIX}:${person._id}`;

  function resetChanges() {
    setFirstName(baselineFirstName);
    setLastName(baselineLastName);
    imageDraft.clearImageDraft();
    toast.dismiss(unsavedToastId);
  }

  async function saveChanges() {
    if (isSaving || !hasChanges) {
      return;
    }

    if (!normalizedFirstName && !normalizedLastName) {
      toast.error(commonT("identity.nameRequired"));
      return;
    }

    setIsSaving(true);
    let uploadedStorageId: Id<"_storage"> | null = null;

    try {
      uploadedStorageId = await uploadStorageFileDraft({
        file: imageDraft.selectedImageFile,
        generateUploadUrl: () => generateImageUploadUrl({ slug }),
      });

      await updateOrganizationPersonProfile({
        slug,
        organizationPersonId: person._id,
        firstName,
        lastName,
        avatarChange:
          uploadedStorageId !== null
            ? {
                kind: "set",
                storageId: uploadedStorageId,
              }
            : imageDraft.shouldRemoveImage
              ? { kind: "remove" }
              : { kind: "keep" },
      });

      setBaselineFirstName(normalizedFirstName);
      setBaselineLastName(normalizedLastName);
      setFirstName(normalizedFirstName);
      setLastName(normalizedLastName);
      imageDraft.clearImageDraft();
      toast.dismiss(unsavedToastId);
      toast.success(t("profile.personalInformationSaved"));
    } catch (error) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: ({ storageId }) => discardImageUpload({ slug, storageId }),
      });
      toast.error(getProfileUpdateErrorMessage({ commonT, error, t }));
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveChanges();
  }

  const resetChangesEvent = useEffectEvent(() => {
    resetChanges();
  });
  const saveChangesEvent = useEffectEvent(() => {
    void saveChanges();
  });
  const resetToCurrentPersonEvent = useEffectEvent(() => {
    const nextNameParts = getNormalizedPersonNameParts(person);
    setBaselineFirstName(nextNameParts.firstName);
    setBaselineLastName(nextNameParts.lastName);
    setFirstName(nextNameParts.firstName);
    setLastName(nextNameParts.lastName);
    imageDraft.clearImageDraft();
    toast.dismiss(unsavedToastId);
  });

  useEffect(() => {
    resetToCurrentPersonEvent();
  }, [person._id]);

  useEffect(() => {
    if (!hasChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasChanges]);

  useEffect(() => {
    if (!hasChanges) {
      toast.dismiss(unsavedToastId);
      return;
    }

    toast.custom(
      () => (
        <TenantUnsavedChangesToast
          isSaving={isSaving}
          message={t("profile.unsavedChanges")}
          resetLabel={t("profile.resetChanges")}
          saveLabel={t("profile.saveChanges")}
          onReset={resetChangesEvent}
          onSave={saveChangesEvent}
        />
      ),
      {
        id: unsavedToastId,
        duration: Infinity,
        position: "bottom-center",
      },
    );

    return () => {
      toast.dismiss(unsavedToastId);
    };
  }, [hasChanges, isSaving, t, unsavedToastId]);

  return {
    firstName,
    lastName,
    avatarAlt,
    avatarFallback,
    displayedAvatarUrl: imageDraft.displayedImageUrl,
    canRemoveAvatar: imageDraft.canRemoveImage,
    isSaving: isSaving || !!imageDraft.imageCropSourceUrl,
    imageCropSourceUrl: imageDraft.imageCropSourceUrl,
    imageCropFileName: imageDraft.imageCropFileName,
    handleSelectAvatarFile: imageDraft.handleSelectImageFile,
    handleRemoveAvatar: imageDraft.handleRemoveImage,
    handleCancelAvatarCrop: imageDraft.handleCancelImageCrop,
    handleConfirmAvatarCrop: imageDraft.handleConfirmImageCrop,
    handleSubmit,
    setFirstName,
    setLastName,
  };
}
