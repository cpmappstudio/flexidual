"use client";

import { ImageUploadControl } from "@/components/files/image-upload-control";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

export type ImageUploadFieldProps = {
  imageUrl: string | null;
  imageAlt: string;
  imageFallback: string;
  imageLabel: string;
  imageLabelClassName?: string;
  uploadLabel: string;
  removeLabel: string;
  requirementsText: string;
  isSaving: boolean;
  disabled?: boolean;
  canRemoveImage: boolean;
  error: string | null;
  errorId?: string;
  onSelectImageFile: (file: File) => void;
  onRemoveImage: () => void;
};

export function ImageUploadField({
  imageUrl,
  imageAlt,
  imageFallback,
  imageLabel,
  imageLabelClassName,
  uploadLabel,
  removeLabel,
  requirementsText,
  isSaving,
  disabled,
  canRemoveImage,
  error,
  errorId = "image-upload-error",
  onSelectImageFile,
  onRemoveImage,
}: ImageUploadFieldProps) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel className={imageLabelClassName}>{imageLabel}</FieldLabel>
      <FieldContent className="gap-3">
        <ImageUploadControl
          imageUrl={imageUrl}
          imageAlt={imageAlt}
          imageFallback={imageFallback}
          uploadLabel={uploadLabel}
          removeLabel={removeLabel}
          requirementsText={requirementsText}
          isSaving={isSaving}
          disabled={disabled}
          canRemoveImage={canRemoveImage}
          onSelectImageFile={onSelectImageFile}
          onRemoveImage={onRemoveImage}
          previewClickable
          previewTriggerLabel={uploadLabel}
          avatarClassName="size-20 rounded-2xl border border-border/60 after:rounded-2xl"
          avatarImageClassName="rounded-2xl"
          avatarFallbackClassName="rounded-2xl text-sm font-semibold"
        />
        <FieldError id={errorId}>{error}</FieldError>
      </FieldContent>
    </Field>
  );
}
