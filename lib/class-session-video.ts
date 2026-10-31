export const SESSION_VIDEO_PART_BYTES = 8 * 1024 * 1024;
export const MAX_SESSION_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const SESSION_VIDEO_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
// Let a Node action started just before expiry finish (10-minute runtime limit).
export const SESSION_VIDEO_CLEANUP_GRACE_MS = 15 * 60 * 1000;

export function validSessionVideo(file: {
  name: string;
  contentType: string;
  size: number;
  durationMs: number;
}) {
  return (
    file.name.trim().length > 0 &&
    file.name.length <= 180 &&
    !/[\x00-\x1f\x7f/\\]/.test(file.name) &&
    file.name.toLowerCase().endsWith(".mp4") &&
    file.contentType === "video/mp4" &&
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    file.size <= MAX_SESSION_VIDEO_BYTES &&
    Number.isFinite(file.durationMs) &&
    file.durationMs > 0 &&
    file.durationMs <= 12 * 60 * 60 * 1000
  );
}

export function sessionVideoPartSize(size: number, partNumber: number) {
  if (
    !Number.isSafeInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > Math.ceil(size / SESSION_VIDEO_PART_BYTES)
  )
    return null;
  return Math.min(
    SESSION_VIDEO_PART_BYTES,
    size - (partNumber - 1) * SESSION_VIDEO_PART_BYTES,
  );
}

export function sessionVideoObjectKey(id: string) {
  return `prerecorded/${id}.mp4`;
}
