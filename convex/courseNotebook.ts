import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  requireCourseNotebookAccess,
  requireNotebookPage,
  assertNotebookActive,
} from "./model/courseNotebookAccess";
import { getClassTimeZone } from "./model/timeZone";
import { readNotebookPreview } from "./model/notebookPreview";
import {
  applyWhiteboardSceneDelta,
  readWhiteboardBucketResult,
  whiteboardCursorValidator,
  whiteboardBucketResultValidator,
  whiteboardDeltaResultValidator,
} from "./model/whiteboardSceneStorage";

export async function initializeCourseNotebook(
  ctx: MutationCtx,
  course: Doc<"classes">,
) {
  if (course.notebookInitializedAt !== undefined) return;
  const now = Date.now();
  await ctx.db.patch("classes", course._id, {
    notebookInitializedAt: now,
    ...(course.endDate !== undefined && course.endDate < now
      ? { notebookArchivedAt: now }
      : {}),
  });
  if (course.endDate !== undefined && course.endDate >= now)
    await ctx.scheduler.runAt(
      course.endDate + 1,
      internal.courseNotebook.archiveAtCourseEnd,
      { classId: course._id, expectedEndDate: course.endDate },
    );
}

export const initialize = mutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, { classId }) => {
    const { course } = await requireCourseNotebookAccess(ctx, classId);
    await initializeCourseNotebook(ctx, course);
    return null;
  },
});

export const get = query({
  args: { classId: v.id("classes") },
  returns: v.object({
    archived: v.boolean(),
    initialized: v.boolean(),
    canEdit: v.boolean(),
    canArchive: v.boolean(),
    timeZone: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { classId }) => {
    const { course, canEdit, canArchive } = await requireCourseNotebookAccess(
      ctx,
      classId,
    );
    return {
      archived: course.notebookArchivedAt !== undefined,
      initialized: course.notebookInitializedAt !== undefined,
      canEdit,
      canArchive,
      timeZone: (await getClassTimeZone(ctx, course)) ?? null,
    };
  },
});

const pageValidator = v.object({
  _id: v.id("courseNotebookPages"),
  _creationTime: v.number(),
  title: v.string(),
  previewUrl: v.union(v.string(), v.null()),
});
export const listPages = query({
  args: {
    classId: v.id("classes"),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(pageValidator),
  handler: async (ctx, { classId, search, paginationOpts }) => {
    const { course } = await requireCourseNotebookAccess(ctx, classId);
    const pages = ctx.db.query("courseNotebookPages");
    const term = search?.trim();
    const result = await (
      term
        ? pages.withSearchIndex("search_title", (q) =>
            q
              .search("title", term)
              .eq("classId", classId)
              .eq("retiredAt", undefined),
          )
        : pages
            .withIndex("by_classId_and_retiredAt", (q) =>
              q.eq("classId", classId).eq("retiredAt", undefined),
            )
            .order("desc")
    ).paginate(paginationOpts);
    return {
      ...result,
      page:
        course.notebookArchivedAt !== undefined
          ? []
          : await Promise.all(
              result.page.map(async (page) => {
                const { state: preview } = await readNotebookPreview(ctx, page);
                return {
                  _id: page._id,
                  _creationTime: page._creationTime,
                  title: page.title,
                  previewUrl: preview.previewStorageId
                    ? await ctx.storage.getUrl(preview.previewStorageId)
                    : null,
                };
              }),
            ),
    };
  },
});

export const createPage = mutation({
  args: { classId: v.id("classes") },
  returns: v.id("courseNotebookPages"),
  handler: async (ctx, { classId }) => {
    const { course, user } = await requireCourseNotebookAccess(
      ctx,
      classId,
      true,
    );
    assertNotebookActive(course);
    const timeZone = await getClassTimeZone(ctx, course);
    if (!timeZone) throw new ConvexError("INVALID_TIME_ZONE");
    let title: string;
    try {
      title = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
      }).format(Date.now());
    } catch {
      throw new ConvexError("INVALID_TIME_ZONE");
    }
    await initializeCourseNotebook(ctx, course);
    const pageId = await ctx.db.insert("courseNotebookPages", {
      classId,
      title,
      createdBy: user._id,
    });
    await ctx.db.insert("whiteboardSceneManifests", {
      pageId,
      fromLegacy: false,
      generation: 0,
      bucketIds: [],
      legacyOrder: [],
    });
    return pageId;
  },
});

export const renamePage = mutation({
  args: { pageId: v.id("courseNotebookPages"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { pageId, title }) => {
    await requireNotebookPage(ctx, pageId, true);
    const value = title.trim();
    if (!value || value.length > 200)
      throw new ConvexError("INVALID_NOTEBOOK_TITLE");
    await ctx.db.patch("courseNotebookPages", pageId, { title: value });
    return null;
  },
});

async function requireManifest(
  ctx: Parameters<typeof requireNotebookPage>[0],
  pageId: Id<"courseNotebookPages">,
  edit = false,
) {
  await requireNotebookPage(ctx, pageId, edit);
  const manifest = await ctx.db
    .query("whiteboardSceneManifests")
    .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
    .unique();
  if (!manifest) throw new ConvexError("NOTEBOOK_PAGE_NOT_FOUND");
  return manifest;
}

export const getManifest = query({
  args: { pageId: v.id("courseNotebookPages") },
  returns: v.object({
    sourceId: v.id("whiteboardSceneManifests"),
    generation: v.number(),
    bucketIds: v.array(v.number()),
  }),
  handler: async (ctx, { pageId }) => {
    const manifest = await requireManifest(ctx, pageId);
    return {
      sourceId: manifest._id,
      generation: manifest.generation,
      bucketIds: manifest.bucketIds,
    };
  },
});

export const getBucket = query({
  args: {
    pageId: v.id("courseNotebookPages"),
    bucketId: v.number(),
    cursor: v.optional(whiteboardCursorValidator),
  },
  returns: whiteboardBucketResultValidator,
  handler: async (ctx, { pageId, bucketId, cursor }) =>
    readWhiteboardBucketResult(
      ctx,
      await requireManifest(ctx, pageId),
      bucketId,
      cursor,
    ),
});

export const applyDelta = mutation({
  args: {
    pageId: v.id("courseNotebookPages"),
    generation: v.number(),
    bucketId: v.number(),
    parts: v.array(v.string()),
  },
  returns: whiteboardDeltaResultValidator,
  handler: async (ctx, { pageId, generation, bucketId, parts }) =>
    applyWhiteboardSceneDelta(
      ctx,
      await requireManifest(ctx, pageId, true),
      bucketId,
      parts,
      generation,
    ),
});

export const setArchived = mutation({
  args: { classId: v.id("classes"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { classId, archived }) => {
    const { course, canArchive } = await requireCourseNotebookAccess(
      ctx,
      classId,
    );
    if (!canArchive) throw new ConvexError("PERMISSION_DENIED");
    await initializeCourseNotebook(ctx, course);
    await ctx.db.patch("classes", classId, {
      notebookArchivedAt: archived ? Date.now() : undefined,
    });
    return null;
  },
});

export const archiveAtCourseEnd = internalMutation({
  args: { classId: v.id("classes"), expectedEndDate: v.number() },
  returns: v.null(),
  handler: async (ctx, { classId, expectedEndDate }) => {
    const course = await ctx.db.get("classes", classId);
    if (
      course &&
      course.endDate === expectedEndDate &&
      expectedEndDate < Date.now() &&
      course.notebookArchivedAt === undefined
    )
      await ctx.db.patch("classes", classId, {
        notebookArchivedAt: Date.now(),
      });
    return null;
  },
});

export const removeByClass = internalMutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, { classId }) => {
    if (await ctx.db.get("classes", classId)) return null;
    const pages = await ctx.db
      .query("courseNotebookPages")
      .withIndex("by_classId", (q) => q.eq("classId", classId))
      .take(1);
    for (const page of pages) {
      const files = await ctx.db
        .query("courseNotebookFiles")
        .withIndex("by_pageId_and_fileId", (q) => q.eq("pageId", page._id))
        .take(16);
      for (const file of files) {
        await ctx.storage.delete(file.storageId);
        await ctx.db.delete("courseNotebookFiles", file._id);
      }
      if (files.length < 16) {
        const preview = await readNotebookPreview(ctx, page);
        for (const id of new Set([
          page.previewStorageId,
          preview.state.previewStorageId,
        ])) {
          if (id && (await ctx.db.system.get("_storage", id)))
            await ctx.storage.delete(id);
        }
        if (preview.id)
          await ctx.db.delete("courseNotebookPreviews", preview.id);
        const manifest = await ctx.db
          .query("whiteboardSceneManifests")
          .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
          .unique();
        if (manifest) {
          await ctx.db.delete("whiteboardSceneManifests", manifest._id);
          await ctx.scheduler.runAfter(
            0,
            internal.whiteboardSessions.cleanupSceneBuckets,
            { manifestId: manifest._id },
          );
        }
        await ctx.db.delete("courseNotebookPages", page._id);
      }
      await ctx.scheduler.runAfter(0, internal.courseNotebook.removeByClass, {
        classId,
      });
    }
    return null;
  },
});
