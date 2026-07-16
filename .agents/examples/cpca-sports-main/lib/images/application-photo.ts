export const APPLICATION_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const APPLICATION_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const APPLICATION_PHOTO_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const APPLICATION_PHOTO_MAX_DIMENSION = 512;
const APPLICATION_PHOTO_QUALITY = 0.82;
const APPLICATION_PHOTO_OUTPUT_TYPE = "image/webp";
const APPLICATION_PHOTO_FALLBACK_TYPE = "image/jpeg";

export type ApplicationPhotoErrorCode =
  | "invalidType"
  | "maxSize"
  | "decodeFailed"
  | "optimizeFailed";

export class ApplicationPhotoError extends Error {
  constructor(readonly code: ApplicationPhotoErrorCode) {
    super(code);
  }
}

export async function prepareApplicationPhoto(file: File) {
  validateApplicationPhoto(file);

  const image = await loadImage(file);
  const canvas = resizeImage(image);
  const blob =
    (await getTypedCanvasBlob(
      canvas,
      APPLICATION_PHOTO_OUTPUT_TYPE,
      APPLICATION_PHOTO_QUALITY,
    )) ??
    (await getTypedCanvasBlob(
      canvas,
      APPLICATION_PHOTO_FALLBACK_TYPE,
      APPLICATION_PHOTO_QUALITY,
    ));

  if (!blob) {
    throw new ApplicationPhotoError("optimizeFailed");
  }

  return new File([blob], getOptimizedFileName(file.name, blob.type), {
    type: blob.type,
    lastModified: Date.now(),
  });
}

function validateApplicationPhoto(file: File) {
  if (!APPLICATION_PHOTO_ALLOWED_TYPES.has(file.type)) {
    throw new ApplicationPhotoError("invalidType");
  }

  if (file.size > APPLICATION_PHOTO_MAX_SIZE_BYTES) {
    throw new ApplicationPhotoError("maxSize");
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ApplicationPhotoError("decodeFailed"));
    };
    image.src = url;
  });
}

function resizeImage(image: HTMLImageElement) {
  const { width, height } = getImageSize(image);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new ApplicationPhotoError("optimizeFailed");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas;
}

function getImageSize(image: HTMLImageElement) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(
    APPLICATION_PHOTO_MAX_DIMENSION / sourceWidth,
    APPLICATION_PHOTO_MAX_DIMENSION / sourceHeight,
    1,
  );

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function getCanvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function getTypedCanvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  const blob = await getCanvasBlob(canvas, type, quality);
  return blob?.type === type ? blob : null;
}

function getOptimizedFileName(fileName: string, type: string) {
  const extension = type === APPLICATION_PHOTO_OUTPUT_TYPE ? "webp" : "jpg";
  const baseName = fileName.replace(/\.[^/.]+$/, "") || "application-photo";

  return `${baseName}.${extension}`;
}
