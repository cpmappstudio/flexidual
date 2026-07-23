"use client";

import { useImageCropDraft } from "@/hooks/use-image-crop-draft";
import { getImageValidationErrorCode } from "@/lib/files/image";

export function useImageUploadDraft() {
  const draft = useImageCropDraft();

  function handleSelectImageFile(file: File) {
    const validationErrorCode = getImageValidationErrorCode(file);
    if (validationErrorCode) {
      return validationErrorCode;
    }

    draft.startCrop(file);
    return null;
  }

  return {
    selectedImageFile: draft.selectedFile,
    imageCropSourceUrl: draft.cropSourceUrl,
    imageCropFileName: draft.cropFileName,
    displayedImageUrl: draft.selectedFilePreviewUrl,
    canRemoveImage: !!draft.selectedFile,
    handleSelectImageFile,
    handleCancelImageCrop: draft.cancelCrop,
    handleConfirmImageCrop: draft.confirmCrop,
    handleRemoveImage: draft.clearDraft,
    clearImageDraft: draft.clearDraft,
  };
}
