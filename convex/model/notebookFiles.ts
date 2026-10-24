import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

/** Caller authorizes either notebook access or the single page presented live. */
export async function readNotebookFileRefs(
  ctx: QueryCtx | MutationCtx,
  pageId: Id<"courseNotebookPages">,
  fileIds: string[],
) {
  if (fileIds.length > 64) throw new ConvexError("INVALID_WHITEBOARD_FILE");
  const refs = await Promise.all(
    [...new Set(fileIds)].map(async (fileId) => {
      const file = await ctx.db
        .query("courseNotebookFiles")
        .withIndex("by_pageId_and_fileId", (q) =>
          q.eq("pageId", pageId).eq("fileId", fileId),
        )
        .unique();
      if (!file) return [];
      const url = await ctx.storage.getUrl(file.storageId);
      return url
        ? [
            [
              fileId,
              {
                url,
                mimeType: file.mimeType,
                storageId: file.storageId,
                created: file.created,
              },
            ],
          ]
        : [];
    }),
  );
  return Object.fromEntries(refs.flat());
}
