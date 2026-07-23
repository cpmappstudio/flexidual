"use client";

import type { ProfileAvatarDraftSubject } from "@/components/profile/types";
import { useRemovableImageUploadDraft } from "@/hooks/use-removable-image-upload-draft";

export function useProfileAvatarDraft(currentUser: ProfileAvatarDraftSubject) {
  const draft = useRemovableImageUploadDraft({
    imageUrl: currentUser.avatarUrl,
    removeFallbackImageUrl: currentUser.image ?? null,
    hasRemovableImage: currentUser.hasUploadedAvatar,
  });

  return {
    selectedAvatarFile: draft.selectedImageFile,
    avatarCropSourceUrl: draft.imageCropSourceUrl,
    avatarCropFileName: draft.imageCropFileName,
    shouldRemoveAvatar: draft.shouldRemoveImage,
    displayedAvatarUrl: draft.displayedImageUrl,
    canRemoveAvatar: draft.canRemoveImage,
    hasPendingAvatarChanges: draft.hasPendingImageChanges,
    handleSelectAvatarFile: draft.handleSelectImageFile,
    handleCancelAvatarCrop: draft.handleCancelImageCrop,
    handleConfirmAvatarCrop: draft.handleConfirmImageCrop,
    handleRemoveAvatar: draft.handleRemoveImage,
    clearAvatarDraft: draft.clearImageDraft,
  };
}
