"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useImageUploadDraft } from "@/hooks/use-image-upload-draft";
import { useRouter } from "@/i18n/navigation";
import { getErrorCode } from "@/lib/convex-errors";
import {
  getImageFallbackLabel,
  getImageUploadErrorMessage,
} from "@/lib/files/image";
import {
  discardStorageUpload,
  uploadStorageFileDraft,
} from "@/lib/files/storage-upload";

function hasCampusNameContent(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

function getCreateCampusErrorDetails(
  t: ReturnType<typeof useTranslations<"TenantHome">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "CAMPUS_NAME_REQUIRED") {
    return {
      field: "name" as const,
      message: t("createDialogErrors.nameRequired"),
    };
  }

  if (code === "CAMPUS_NAME_INVALID") {
    return {
      field: "name" as const,
      message: t("createDialogErrors.nameInvalid"),
    };
  }

  if (code === "CAMPUS_SLUG_UNAVAILABLE") {
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

export function useTenantCreateCampusDialog(tenantSlug: string) {
  const router = useRouter();
  const t = useTranslations("TenantHome");
  const createCampus = useMutation(api.platform.campuses.createForOrganization);
  const generateImageUploadUrl = useMutation(
    api.platform.campuses.generateImageUploadUrl,
  );
  const discardImageUpload = useMutation(api.platform.campuses.discardImageUpload);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setImageError(null);
    setFormError(null);
    setIsSubmitting(true);
    let uploadedStorageId: Id<"_storage"> | null = null;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t("createDialogErrors.nameRequired"));
      setIsSubmitting(false);
      return;
    }

    if (!hasCampusNameContent(trimmedName)) {
      setNameError(t("createDialogErrors.nameInvalid"));
      setIsSubmitting(false);
      return;
    }

    try {
      uploadedStorageId = await uploadStorageFileDraft({
        file: selectedImageFile,
        generateUploadUrl: () =>
          generateImageUploadUrl({
            slug: tenantSlug,
          }),
      });

      await createCampus({
        slug: tenantSlug,
        name: trimmedName,
        imageStorageId: uploadedStorageId ?? undefined,
      });

      toast.success(t("createDialog.success"));
      resetForm();
      setOpen(false);
      router.refresh();
    } catch (createError) {
      await discardStorageUpload({
        storageId: uploadedStorageId,
        discardUpload: ({ storageId }) =>
          discardImageUpload({
            slug: tenantSlug,
            storageId,
          }),
      });

      const errorDetails = getCreateCampusErrorDetails(t, createError);

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

  const campusName = name.trim();

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
    campusName,
    isImageBusy: isSubmitting || !!imageCropSourceUrl,
    imageFallback: getImageFallbackLabel({
      name: campusName,
      fallback: "CA",
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
