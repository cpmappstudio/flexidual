"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useImageCropDraft } from "@/hooks/use-image-crop-draft";
import {
  getImageUploadErrorMessage,
  getImageValidationErrorCode,
} from "@/lib/files/image";

export function useRemovableImageUploadDraft({
  imageUrl,
  removeFallbackImageUrl = null,
  hasRemovableImage,
}: {
  imageUrl: string | null;
  removeFallbackImageUrl?: string | null;
  hasRemovableImage: boolean;
}) {
  const t = useTranslations("Common");
  const draft = useImageCropDraft();
  const [shouldRemoveImage, setShouldRemoveImage] = useState(false);

  function handleSelectImageFile(file: File) {
    const validationErrorCode = getImageValidationErrorCode(file);
    if (validationErrorCode) {
      toast.error(
        getImageUploadErrorMessage({
          errorCode: validationErrorCode,
          invalidTypeMessage: t("imageUpload.errors.invalidType"),
          tooLargeMessage: t("imageUpload.errors.tooLarge"),
          uploadFailedMessage: t("imageUpload.errors.uploadFailed"),
          fallbackMessage: t("imageUpload.errors.uploadFailed"),
        }),
      );
      return;
    }

    draft.startCrop(file);
  }

  function handleConfirmImageCrop(file: File) {
    draft.confirmCrop(file);
    setShouldRemoveImage(false);
  }

  function handleRemoveImage() {
    draft.clearDraft();
    setShouldRemoveImage(hasRemovableImage);
  }

  function clearImageDraft() {
    draft.clearDraft();
    setShouldRemoveImage(false);
  }

  return {
    selectedImageFile: draft.selectedFile,
    imageCropSourceUrl: draft.cropSourceUrl,
    imageCropFileName: draft.cropFileName,
    shouldRemoveImage,
    displayedImageUrl:
      draft.selectedFilePreviewUrl ??
      (shouldRemoveImage ? removeFallbackImageUrl : imageUrl),
    canRemoveImage:
      !!draft.selectedFile || (!shouldRemoveImage && hasRemovableImage),
    hasPendingImageChanges: draft.selectedFile !== null || shouldRemoveImage,
    handleSelectImageFile,
    handleCancelImageCrop: draft.cancelCrop,
    handleConfirmImageCrop,
    handleRemoveImage,
    clearImageDraft,
  };
}
