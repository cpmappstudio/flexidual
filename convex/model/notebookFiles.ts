import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

type NotebookFileRef = Pick<
  Doc<"courseNotebookFiles">,
  "storageId" | "mimeType" | "created"
> & { url: string };

/** Caller authorizes either notebook access or the single page presented live. */
export async function readNotebookFileRefs(
  ctx: QueryCtx | MutationCtx,
  pageId: Id<"courseNotebookPages">,
  fileIds?: string[],
): Promise<Record<string, NotebookFileRef>> {
  if (fileIds && fileIds.length > 64)
    throw new ConvexError("INVALID_WHITEBOARD_FILE");
  // Full maps are only for the bounded, legacy session endpoints, not the editor.
  const files =
    fileIds === undefined
      ? await ctx.db
          .query("courseNotebookFiles")
          .withIndex("by_pageId_and_fileId", (q) => q.eq("pageId", pageId))
          .take(1025)
      : await Promise.all(
          [...new Set(fileIds)].map((fileId) =>
            ctx.db
              .query("courseNotebookFiles")
              .withIndex("by_pageId_and_fileId", (q) =>
                q.eq("pageId", pageId).eq("fileId", fileId),
              )
              .unique(),
          ),
        );
  if (fileIds === undefined && files.length > 1024)
    throw new ConvexError("WHITEBOARD_SCENE_REQUIRES_INCREMENTAL_CLIENT");
  const refs: [string, NotebookFileRef][] = [];
  // Legacy maps may contain 1024 images; keep storage I/O within the same 64-file bound.
  for (let start = 0; start < files.length; start += 64) {
    const batch = await Promise.all(
      files
        .slice(start, start + 64)
        .map(async (file): Promise<[string, NotebookFileRef] | null> => {
          if (!file) return null;
          const url = await ctx.storage.getUrl(file.storageId);
          return url
            ? [
                file.fileId,
                {
                  url,
                  mimeType: file.mimeType,
                  storageId: file.storageId,
                  created: file.created,
                },
              ]
            : null;
        }),
    );
    refs.push(...batch.filter((ref) => ref !== null));
  }
  return Object.fromEntries(refs);
}

/** Immutable image ownership is shared by live uploads and course-page uploads. */
export async function attachNotebookFile(
  ctx: MutationCtx,
  pageId: Id<"courseNotebookPages">,
  file: Omit<NotebookFileRef, "url"> & { fileId: string },
) {
  const existing = await ctx.db
    .query("courseNotebookFiles")
    .withIndex("by_pageId_and_fileId", (q) =>
      q.eq("pageId", pageId).eq("fileId", file.fileId),
    )
    .unique();
  const stored = existing ?? file;
  const url = await ctx.storage.getUrl(stored.storageId);
  if (!url) throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
  if (!existing)
    await ctx.db.insert("courseNotebookFiles", { pageId, ...file });
  return {
    url,
    storageId: stored.storageId,
    mimeType: stored.mimeType,
    created: stored.created,
  };
}
