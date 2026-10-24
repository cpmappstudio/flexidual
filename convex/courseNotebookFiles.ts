import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireNotebookPage } from "./model/courseNotebookAccess";
import { validateAndLimitWhiteboardUpload } from "./whiteboardFiles";
import { fileRefValidator } from "./whiteboardSessions";
import { readNotebookFileRefs } from "./model/notebookFiles";
import {
  notebookPreviewSnapshot,
  readNotebookPreview,
  writeNotebookPreview,
} from "./model/notebookPreview";

const uploadArgs = {
  pageId: v.id("courseNotebookPages"),
  fileId: v.string(),
  created: v.number(),
  size: v.number(),
  contentType: v.string(),
  previewVersion: v.optional(v.number()),
};

export const beginPreview = mutation({
  args: {
    pageId: v.id("courseNotebookPages"),
    revision: v.string(),
    expectedVersion: v.optional(v.number()),
    retireIfEmpty: v.optional(v.boolean()),
  },
  returns: v.union(
    v.number(),
    v.null(),
    v.object({ preparing: v.literal(true) }),
  ),
  handler: async (
    ctx,
    { pageId, revision, expectedVersion, retireIfEmpty },
  ) => {
    const { page } = await requireNotebookPage(ctx, pageId, true);
    const currentPreview = await readNotebookPreview(ctx, page);
    const preview = currentPreview.state;
    if (
      !/^[a-f0-9]{64}$/.test(revision) ||
      (expectedVersion !== undefined &&
        (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0))
    )
      throw new ConvexError("INVALID_NOTEBOOK_PREVIEW_REVISION");
    // A completed identical thumbnail is a no-op, including a lost response.
    // It cannot overwrite anything, so avoid reading bucket history on reopen.
    if (
      !retireIfEmpty &&
      preview.previewRevision === revision &&
      preview.previewStorageId
    )
      return null;
    const current = await notebookPreviewSnapshot(ctx, pageId, true);
    if (current === undefined) return { preparing: true } as const;
    if (current.revision !== revision)
      throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
    if (retireIfEmpty && !current.hasContent) {
      if (page.retiredAt === undefined)
        await ctx.db.patch("courseNotebookPages", pageId, {
          retiredAt: Date.now(),
        });
      // Only the disposable thumbnail is removed. Keep scene tombstones and
      // image references for late drafts, another editor's undo and recordings.
      for (const id of new Set([
        page.previewStorageId,
        preview.previewStorageId,
      ]))
        if (id && (await ctx.db.system.get("_storage", id)))
          await ctx.storage.delete(id);
      if (
        preview.previewStorageId ||
        preview.previewRequestedRevision ||
        preview.previewRevision
      )
        await writeNotebookPreview(ctx, currentPreview, {
          previewVersion: (preview.previewVersion ?? 0) + 1,
          previewStorageId: undefined,
          previewRevision: undefined,
          previewRequestedRevision: undefined,
        });
      if (
        page.previewStorageId ||
        page.previewRevision ||
        page.previewVersion !== undefined ||
        page.previewRequestedRevision
      )
        await ctx.db.patch("courseNotebookPages", pageId, {
          previewStorageId: undefined,
          previewRevision: undefined,
          previewVersion: undefined,
          previewRequestedRevision: undefined,
        });
      return null;
    }
    if (page.retiredAt !== undefined)
      throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
    if (expectedVersion !== undefined) {
      if (
        expectedVersion !== preview.previewVersion ||
        revision !== preview.previewRequestedRevision
      )
        throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
      return expectedVersion;
    }
    const version = (preview.previewVersion ?? 0) + 1;
    await writeNotebookPreview(ctx, currentPreview, {
      previewVersion: version,
      previewRequestedRevision: revision,
    });
    return version;
  },
});

export const authorizeUpload = internalMutation({
  args: uploadArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { page, user } = await requireNotebookPage(ctx, args.pageId, true);
    const preview =
      args.previewVersion !== undefined
        ? (await readNotebookPreview(ctx, page)).state
        : undefined;
    if (
      args.previewVersion !== undefined &&
      (page.retiredAt !== undefined ||
        !preview?.previewRequestedRevision ||
        args.previewVersion !== preview.previewVersion ||
        args.fileId !== "preview" ||
        args.size > 256 * 1024 ||
        args.contentType !== "image/png")
    )
      throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
    await validateAndLimitWhiteboardUpload(ctx, user._id, args);
    return null;
  },
});

export const complete = internalMutation({
  args: { ...uploadArgs, storageId: v.id("_storage") },
  returns: fileRefValidator,
  handler: async (ctx, args) => {
    const { page } = await requireNotebookPage(ctx, args.pageId, true);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (
      !metadata ||
      metadata.size !== args.size ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== args.contentType)
    )
      throw new ConvexError("INVALID_WHITEBOARD_FILE");
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
    if (args.previewVersion !== undefined) {
      const currentPreview = await readNotebookPreview(ctx, page);
      const preview = currentPreview.state;
      if (args.previewVersion !== preview.previewVersion)
        throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
      if (
        page.retiredAt !== undefined ||
        !preview.previewRequestedRevision ||
        (await notebookPreviewSnapshot(ctx, args.pageId))?.revision !==
          preview.previewRequestedRevision
      )
        throw new ConvexError("STALE_NOTEBOOK_PREVIEW");
      if (
        preview.previewStorageId &&
        preview.previewStorageId !== args.storageId
      )
        await ctx.storage.delete(preview.previewStorageId);
      await writeNotebookPreview(ctx, currentPreview, {
        previewStorageId: args.storageId,
        previewRevision: preview.previewRequestedRevision,
      });
    } else {
      const existing = await ctx.db
        .query("courseNotebookFiles")
        .withIndex("by_pageId_and_fileId", (q) =>
          q.eq("pageId", args.pageId).eq("fileId", args.fileId),
        )
        .unique();
      if (existing) {
        const existingUrl = await ctx.storage.getUrl(existing.storageId);
        if (!existingUrl) throw new ConvexError("WHITEBOARD_FILE_NOT_FOUND");
        return {
          url: existingUrl,
          mimeType: existing.mimeType,
          storageId: existing.storageId,
          created: existing.created,
        };
      }
      await ctx.db.insert("courseNotebookFiles", {
        pageId: args.pageId,
        fileId: args.fileId,
        storageId: args.storageId,
        mimeType: args.contentType,
        created: args.created,
      });
    }
    return {
      url,
      mimeType: args.contentType,
      storageId: args.storageId,
      created: args.created,
    };
  },
});

export const getFiles = query({
  args: { pageId: v.id("courseNotebookPages"), fileIds: v.array(v.string()) },
  returns: v.record(v.string(), fileRefValidator),
  handler: async (ctx, { pageId, fileIds }) => {
    await requireNotebookPage(ctx, pageId);
    return readNotebookFileRefs(ctx, pageId, fileIds);
  },
});
