export const IMAGE_UPLOAD_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const IMAGE_UPLOAD_ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export const IMAGE_FILE_INPUT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";

export function getInitials(source: string, fallback: string): string {
  const initials = source
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0])
    .join("")
    .toUpperCase();

  return initials || fallback;
}

export function getOptionalImageSrc(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function getImageFallbackLabel(args: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback?: string;
}) {
  const fallback = args.fallback || "CP";
  const source =
    args.name ||
    [args.firstName, args.lastName].filter(Boolean).join(" ") ||
    args.email ||
    fallback;

  return getInitials(source, fallback);
}

export function getImageUploadErrorMessage(args: {
  errorCode: string | null;
  invalidTypeMessage: string;
  tooLargeMessage: string;
  uploadFailedMessage: string;
  fallbackMessage: string;
}) {
  if (args.errorCode === "INVALID_IMAGE_TYPE") {
    return args.invalidTypeMessage;
  }

  if (args.errorCode === "IMAGE_TOO_LARGE") {
    return args.tooLargeMessage;
  }

  if (
    args.errorCode === "UPLOAD_FAILED" ||
    args.errorCode === "IMAGE_UPLOAD_NOT_FOUND"
  ) {
    return args.uploadFailedMessage;
  }

  return args.fallbackMessage;
}

export function isAllowedImageContentType(
  contentType: string | null | undefined,
) {
  return (
    !!contentType &&
    IMAGE_UPLOAD_ALLOWED_CONTENT_TYPES.includes(
      contentType as (typeof IMAGE_UPLOAD_ALLOWED_CONTENT_TYPES)[number],
    )
  );
}

export function getImageValidationErrorCode(file: Pick<File, "type" | "size">) {
  if (!isAllowedImageContentType(file.type)) {
    return "INVALID_IMAGE_TYPE" as const;
  }

  if (file.size > IMAGE_UPLOAD_MAX_SIZE_BYTES) {
    return "IMAGE_TOO_LARGE" as const;
  }

  return null;
}
