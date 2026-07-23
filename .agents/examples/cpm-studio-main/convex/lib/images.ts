import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import {
  IMAGE_UPLOAD_MAX_SIZE_BYTES,
  isAllowedImageContentType,
} from "../../lib/files/image";
import { throwAppError } from "./errors";

export async function validateStoredImageFile(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const metadata = await ctx.db.system.get("_storage", storageId);

  if (!metadata) {
    throwAppError("IMAGE_UPLOAD_NOT_FOUND");
  }

  if (!isAllowedImageContentType(metadata.contentType)) {
    throwAppError("INVALID_IMAGE_TYPE");
  }

  if (metadata.size > IMAGE_UPLOAD_MAX_SIZE_BYTES) {
    throwAppError("IMAGE_TOO_LARGE");
  }
}

export async function deleteStoredImageIfPresent(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
) {
  if (!storageId) {
    return;
  }

  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) {
    return;
  }

  await ctx.storage.delete(storageId);
}
