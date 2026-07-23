import type { Area } from "react-easy-crop";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
    image.src = src;
  });
}

function getOutputFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName}.png`;
}

export async function createCroppedImageFile({
  src,
  crop,
  fileName,
  outputWidth,
  outputHeight,
}: {
  src: string;
  crop: Area;
  fileName: string;
  outputWidth: number;
  outputHeight: number;
}) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("CANVAS_CONTEXT_UNAVAILABLE");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    Math.round(crop.x),
    Math.round(crop.y),
    Math.round(crop.width),
    Math.round(crop.height),
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("CROP_BLOB_FAILED"));
        return;
      }
      resolve(value);
    }, "image/png");
  });

  return new File([blob], getOutputFileName(fileName), {
    type: "image/png",
    lastModified: Date.now(),
  });
}
