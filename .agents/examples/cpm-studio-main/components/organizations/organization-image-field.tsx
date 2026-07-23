"use client";

import {
  ImageUploadField,
  type ImageUploadFieldProps,
} from "@/components/files/image-upload-field";

export function OrganizationImageField({
  errorId,
  ...props
}: ImageUploadFieldProps) {
  return (
    <ImageUploadField
      {...props}
      errorId={errorId ?? "organization-image-error"}
    />
  );
}
