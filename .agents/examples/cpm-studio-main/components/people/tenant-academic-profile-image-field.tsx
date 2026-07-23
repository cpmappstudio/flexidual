import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { ImageUploadField } from "@/components/files/image-upload-field";
import { useImageUploadDraft } from "@/hooks/use-image-upload-draft";
import {
  getImageFallbackLabel,
  getImageUploadErrorMessage,
} from "@/lib/files/image";

export function TenantAcademicProfileImageField({
  profileId,
  firstName,
  lastName,
  isSaving,
  onImageFileChange,
}: {
  profileId: string;
  firstName: string;
  lastName: string;
  isSaving: boolean;
  onImageFileChange: (profileId: string, file: File | null) => void;
}) {
  const t = useTranslations("TenantPeople");
  const commonT = useTranslations("Common");
  const [imageError, setImageError] = useState<string | null>(null);
  const {
    imageCropSourceUrl,
    imageCropFileName,
    displayedImageUrl,
    canRemoveImage,
    handleSelectImageFile,
    handleCancelImageCrop,
    handleConfirmImageCrop,
    handleRemoveImage,
  } = useImageUploadDraft();
  const imageLabel = t("academicCreateDialog.imageLabel");
  const imageAlt =
    [firstName, lastName].filter(Boolean).join(" ") || imageLabel;
  const imageFallback = getImageFallbackLabel({
    firstName,
    lastName,
    fallback: "AP",
  });

  function getImageErrorMessage(errorCode: string | null) {
    return getImageUploadErrorMessage({
      errorCode,
      invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
      tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
      uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
      fallbackMessage: commonT("imageUpload.errors.uploadFailed"),
    });
  }

  function handleImageSelection(file: File) {
    setImageError(null);
    const validationErrorCode = handleSelectImageFile(file);
    if (validationErrorCode) {
      onImageFileChange(profileId, null);
      setImageError(getImageErrorMessage(validationErrorCode));
    }
  }

  function handleImageRemove() {
    setImageError(null);
    handleRemoveImage();
    onImageFileChange(profileId, null);
  }

  function handleImageCropConfirm(file: File) {
    setImageError(null);
    handleConfirmImageCrop(file);
    onImageFileChange(profileId, file);
  }

  return (
    <>
      <ImageUploadField
        imageUrl={displayedImageUrl}
        imageAlt={imageAlt}
        imageFallback={imageFallback}
        imageLabel={imageLabel}
        imageLabelClassName="sr-only"
        uploadLabel={commonT("imageUpload.upload")}
        removeLabel={commonT("imageUpload.remove")}
        requirementsText={commonT("imageUpload.requirements")}
        isSaving={isSaving || !!imageCropSourceUrl}
        canRemoveImage={canRemoveImage}
        error={imageError}
        errorId={`academic-profile-${profileId}-image-error`}
        onSelectImageFile={handleImageSelection}
        onRemoveImage={handleImageRemove}
      />

      <ImageCropDialog
        open={!!imageCropSourceUrl}
        src={imageCropSourceUrl}
        fileName={imageCropFileName}
        onCancel={handleCancelImageCrop}
        onConfirm={handleImageCropConfirm}
      />
    </>
  );
}
