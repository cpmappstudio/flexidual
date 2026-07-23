"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { getErrorCode } from "@/lib/convex-errors";
import {
  getImageFallbackLabel,
  getImageUploadErrorMessage,
} from "@/lib/files/image";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";
import { useImageUploadDraft } from "@/hooks/use-image-upload-draft";
import type { AppLocale } from "@/i18n/routing";
import { ROUTES } from "@/lib/navigation/routes";
import { getTenantHostUrl } from "@/lib/tenancy/domain";
import { hasTenantOnboardingServices } from "@/lib/tenancy/services";

function getCreateOrganizationErrorDetails(
  t: ReturnType<typeof useTranslations<"PlatformAdmin">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "ORGANIZATION_NAME_REQUIRED") {
    return {
      field: "name" as const,
      message: t("createDialogErrors.nameRequired"),
    };
  }

  if (code === "ORGANIZATION_NAME_INVALID") {
    return {
      field: "name" as const,
      message: t("createDialogErrors.nameInvalid"),
    };
  }

  if (code === "ORGANIZATION_SLUG_UNAVAILABLE") {
    return {
      field: "name" as const,
      message: t("createDialogErrors.slugUnavailable"),
    };
  }

  const imageMessage = getImageUploadErrorMessage({
    errorCode: code,
    invalidTypeMessage: t("createDialogErrors.imageInvalidType"),
    tooLargeMessage: t("createDialogErrors.imageTooLarge"),
    uploadFailedMessage: t("createDialogErrors.imageUploadFailed"),
    fallbackMessage: "",
  });

  if (imageMessage) {
    return {
      field: "image" as const,
      message: imageMessage,
    };
  }

  return {
    field: "form" as const,
    message: t("genericError"),
  };
}

export function usePlatformCreateOrganizationDialog() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("PlatformAdmin");
  const createOrganization = useMutation(api.organizations.createForPlatform);
  const generateImageUploadUrl = useMutation(api.organizations.generateImageUploadUrl);
  const discardImageUpload = useMutation(api.organizations.discardImageUpload);
  const {
    selectedImageFile,
    imageCropSourceUrl,
    imageCropFileName,
    displayedImageUrl,
    canRemoveImage,
    handleSelectImageFile,
    handleCancelImageCrop,
    handleConfirmImageCrop,
    handleRemoveImage,
    clearImageDraft,
  } = useImageUploadDraft();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setNameError(null);
    setImageError(null);
    setFormError(null);
    setIsSubmitting(false);
    clearImageDraft();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setImageError(null);
    setFormError(null);
    setIsSubmitting(true);
    let uploadedStorageId: Id<"_storage"> | null = null;

    try {
      uploadedStorageId = await uploadStorageFileDraft({
        file: selectedImageFile,
        generateUploadUrl: generateImageUploadUrl,
      });

      const organization = await createOrganization({
        name,
        imageStorageId: uploadedStorageId ?? undefined,
      });
      resetForm();
      setOpen(false);
      window.location.assign(
        getTenantHostUrl(
          organization.slug,
          locale,
          hasTenantOnboardingServices()
            ? ROUTES.tenant.onboarding(organization.slug)
            : ROUTES.tenant.root(organization.slug),
        ),
      );
    } catch (createError) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: discardImageUpload,
      });

      const errorDetails = getCreateOrganizationErrorDetails(t, createError);

      if (errorDetails.field === "name") {
        setNameError(errorDetails.message);
      } else if (errorDetails.field === "image") {
        setImageError(errorDetails.message);
      } else {
        setFormError(errorDetails.message);
      }
      setIsSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  }

  function handleNameChange(nextName: string) {
    setName(nextName);
    if (nameError) {
      setNameError(null);
    }
    if (formError) {
      setFormError(null);
    }
  }

  function handleImageSelection(file: File) {
    setImageError(null);
    setFormError(null);

    const validationErrorCode = handleSelectImageFile(file);
    if (!validationErrorCode) {
      return;
    }

    setImageError(
      getImageUploadErrorMessage({
        errorCode: validationErrorCode,
        invalidTypeMessage: t("createDialogErrors.imageInvalidType"),
        tooLargeMessage: t("createDialogErrors.imageTooLarge"),
        uploadFailedMessage: t("createDialogErrors.imageUploadFailed"),
        fallbackMessage: t("createDialogErrors.imageUploadFailed"),
      }),
    );
  }

  function handleImageRemove() {
    setImageError(null);
    setFormError(null);
    handleRemoveImage();
  }

  const organizationName = name.trim();

  return {
    open,
    name,
    nameError,
    imageError,
    formError,
    isSubmitting,
    displayedImageUrl,
    canRemoveImage,
    imageCropSourceUrl,
    imageCropFileName,
    organizationName,
    isImageBusy: isSubmitting || !!imageCropSourceUrl,
    imageFallback: getImageFallbackLabel({
      name: organizationName,
      fallback: "IN",
    }),
    handleOpenChange,
    handleSubmit,
    handleNameChange,
    handleImageSelection,
    handleImageRemove,
    handleCancelImageCrop,
    handleConfirmImageCrop,
  };
}
