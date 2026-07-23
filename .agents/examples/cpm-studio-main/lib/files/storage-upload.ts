import type { Id } from "@/convex/_generated/dataModel";

export async function uploadStorageFileDraft(args: {
  file: File | null;
  generateUploadUrl: () => Promise<string>;
}) {
  if (!args.file) {
    return null;
  }

  const uploadUrl = await args.generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": args.file.type },
    body: args.file,
  });

  if (!response.ok) {
    throw new Error("UPLOAD_FAILED");
  }

  const { storageId } = (await response.json()) as {
    storageId: Id<"_storage">;
  };

  return storageId;
}

export async function discardStorageUpload(args: {
  storageId: Id<"_storage"> | null;
  discardUpload: (input: { storageId: Id<"_storage"> }) => Promise<unknown>;
}) {
  if (!args.storageId) {
    return;
  }

  try {
    await args.discardUpload({ storageId: args.storageId });
  } catch {
    // Best-effort cleanup.
  }
}
