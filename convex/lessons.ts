import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import {
  canAccessClass,
  canAccessCurriculumContent,
  canModifyCurriculumContent,
} from "./permissions";
import type { Id } from "./_generated/dataModel";
import { insertLessonBatch, lessonDraftValidator } from "./model/lessons";

const lessonFields = {
  _id: v.id("lessons"),
  _creationTime: v.number(),
  curriculumId: v.id("curriculums"),
  title: v.string(),
  description: v.optional(v.string()),
  content: v.optional(v.string()),
  order: v.number(),
  resourceStorageIds: v.optional(v.array(v.id("_storage"))),
  isActive: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
};
const lessonValidator = v.object(lessonFields);

async function validateResourceStorageIds(
  ctx: MutationCtx,
  storageIds: Id<"_storage">[],
) {
  const uniqueStorageIds = [...new Set(storageIds)];
  const metadata = await Promise.all(
    uniqueStorageIds.map((storageId) => ctx.db.system.get(storageId)),
  );
  if (metadata.some((item) => item === null)) {
    throw new ConvexError("LESSON_RESOURCE_NOT_FOUND");
  }
  return uniqueStorageIds;
}

async function requireCurriculumAccess(
  ctx: Parameters<typeof getCurrentUserOrThrow>[0],
  curriculumId: Parameters<typeof canAccessCurriculumContent>[2],
) {
  const user = await getCurrentUserOrThrow(ctx);
  if (!(await canAccessCurriculumContent(ctx, user._id, curriculumId))) {
    throw new ConvexError("PERMISSION_DENIED");
  }
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List lessons by curriculum (ordered)
 */
export const listByCurriculum = query({
  args: {
    curriculumId: v.id("curriculums"),
    includeInactive: v.optional(v.boolean()),
  },
  returns: v.array(lessonValidator),
  handler: async (ctx, args) => {
    await requireCurriculumAccess(ctx, args.curriculumId);
    let lessons;

    if (args.includeInactive) {
      lessons = await ctx.db
        .query("lessons")
        .withIndex("by_curriculum", (q) =>
          q.eq("curriculumId", args.curriculumId),
        )
        .collect();
    } else {
      lessons = await ctx.db
        .query("lessons")
        .withIndex("by_curriculum_active", (q) =>
          q.eq("curriculumId", args.curriculumId).eq("isActive", true),
        )
        .collect();
    }

    // Sort by order field in memory
    return lessons.sort((a, b) => a.order - b.order);
  },
});

export const getClassCurriculumProgress = query({
  args: { classId: v.id("classes") },
  returns: v.union(
    v.null(),
    v.object({
      totalLessons: v.number(),
      taughtLessons: v.number(),
      pendingLessons: v.number(),
      percentage: v.number(),
      lessons: v.array(
        v.object({
          ...lessonFields,
          sessionCount: v.number(),
          lastTaughtAt: v.optional(v.number()),
          status: v.union(v.literal("taught"), v.literal("pending")),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.classId);
    if (!classData || !(await canAccessClass(ctx, user._id, classData))) {
      return null;
    }

    const [lessons, reports, reportLessons] = await Promise.all([
      ctx.db
        .query("lessons")
        .withIndex("by_curriculum_active", (q) =>
          q.eq("curriculumId", classData.curriculumId).eq("isActive", true),
        )
        .collect(),
      ctx.db
        .query("classSessionReports")
        .withIndex("by_class_and_closed_at", (q) =>
          q.eq("classId", classData._id),
        )
        .collect(),
      ctx.db
        .query("classSessionReportLessons")
        .withIndex("by_class_and_lesson", (q) => q.eq("classId", classData._id))
        .collect(),
    ]);
    const closedAtByReport = new Map(
      reports.map((report) => [report._id, report.closedAt]),
    );
    const historyByLesson = new Map<
      Id<"lessons">,
      { count: number; lastTaughtAt: number }
    >();

    for (const reportLesson of reportLessons) {
      const closedAt = closedAtByReport.get(reportLesson.reportId);
      if (closedAt === undefined) continue;
      const history = historyByLesson.get(reportLesson.lessonId) ?? {
        count: 0,
        lastTaughtAt: 0,
      };
      history.count += 1;
      history.lastTaughtAt = Math.max(history.lastTaughtAt, closedAt);
      historyByLesson.set(reportLesson.lessonId, history);
    }

    const lessonsWithProgress = lessons
      .sort((a, b) => a.order - b.order)
      .map((lesson) => {
        const history = historyByLesson.get(lesson._id);
        return {
          ...lesson,
          sessionCount: history?.count ?? 0,
          lastTaughtAt: history?.lastTaughtAt,
          status: history ? ("taught" as const) : ("pending" as const),
        };
      });
    const taughtLessons = lessonsWithProgress.filter(
      (lesson) => lesson.status === "taught",
    ).length;
    const totalLessons = lessonsWithProgress.length;

    return {
      totalLessons,
      taughtLessons,
      pendingLessons: totalLessons - taughtLessons,
      percentage:
        totalLessons === 0
          ? 0
          : Math.round((taughtLessons / totalLessons) * 100),
      lessons: lessonsWithProgress,
    };
  },
});

/**
 * Get single lesson by ID
 */
export const get = query({
  args: { id: v.id("lessons") },
  returns: v.union(lessonValidator, v.null()),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.id);
    if (!lesson) return null;
    await requireCurriculumAccess(ctx, lesson.curriculumId);
    return lesson;
  },
});

/**
 * Get lesson with resource URLs
 * Resolves storage IDs to actual URLs
 */
export const getWithResources = query({
  args: { id: v.id("lessons") },
  returns: v.union(
    v.object({ ...lessonFields, resourceUrls: v.array(v.string()) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.id);
    if (!lesson) return null;
    await requireCurriculumAccess(ctx, lesson.curriculumId);

    let resourceUrls: string[] = [];

    if (lesson.resourceStorageIds && lesson.resourceStorageIds.length > 0) {
      resourceUrls = await Promise.all(
        lesson.resourceStorageIds.map(async (storageId) => {
          const url = await ctx.storage.getUrl(storageId);
          return url || "";
        }),
      );
    }

    return {
      ...lesson,
      resourceUrls: resourceUrls.filter((url) => url !== ""),
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new lesson
 */
export const create = mutation({
  args: {
    curriculumId: v.id("curriculums"),
    title: v.string(),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    order: v.optional(v.number()),
    resourceStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("lessons"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const isAuthorized = await canModifyCurriculumContent(
      ctx,
      user._id,
      args.curriculumId,
    );
    if (!isAuthorized) {
      throw new Error("Not authorized to add lessons to this curriculum.");
    }

    // Calculate order if not provided
    let order = args.order;
    if (order === undefined) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_curriculum", (q) =>
          q.eq("curriculumId", args.curriculumId),
        )
        .collect();

      const maxOrder = lessons.reduce((max, l) => Math.max(max, l.order), 0);
      order = maxOrder + 1;
    }

    const resourceStorageIds = args.resourceStorageIds
      ? await validateResourceStorageIds(ctx, args.resourceStorageIds)
      : undefined;

    return await ctx.db.insert("lessons", {
      curriculumId: args.curriculumId,
      title: args.title,
      description: args.description,
      content: args.content,
      order,
      resourceStorageIds,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

/**
 * Batch create lessons
 * Auto-calculates order to append to the end of the curriculum
 */
export const createBatch = mutation({
  args: {
    curriculumId: v.id("curriculums"),
    lessons: v.array(lessonDraftValidator),
  },
  returns: v.array(
    v.object({
      title: v.string(),
      status: v.union(v.literal("success"), v.literal("error")),
      reason: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const isAuthorized = await canModifyCurriculumContent(
      ctx,
      user._id,
      args.curriculumId,
    );
    if (!isAuthorized) {
      throw new Error("Not authorized to add lessons to this curriculum.");
    }

    const lastLesson = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) =>
        q.eq("curriculumId", args.curriculumId),
      )
      .order("desc")
      .first();
    const normalizedLessons = args.lessons.map((lesson) => ({
      ...lesson,
      title: lesson.title.trim(),
    }));
    await insertLessonBatch(ctx, {
      curriculumId: args.curriculumId,
      createdBy: user._id,
      lessons: normalizedLessons,
      startingOrder: lastLesson?.order ?? 0,
    });

    return normalizedLessons.map((lesson) => ({
      title: lesson.title,
      status: "success" as const,
    }));
  },
});

/**
 * Update lesson
 */
export const update = mutation({
  args: {
    id: v.id("lessons"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    resourceStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const lesson = await ctx.db.get(args.id);
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    const isAuthorized = await canModifyCurriculumContent(
      ctx,
      user._id,
      lesson.curriculumId,
    );
    if (!isAuthorized) {
      throw new Error("Not authorized to update this lesson.");
    }

    const resourceStorageIds =
      args.resourceStorageIds === undefined
        ? undefined
        : await validateResourceStorageIds(ctx, args.resourceStorageIds);
    const removedStorageIds =
      resourceStorageIds === undefined
        ? []
        : (lesson.resourceStorageIds ?? []).filter(
            (storageId) => !resourceStorageIds.includes(storageId),
          );
    const { id, ...updates } = args;
    if (resourceStorageIds !== undefined) {
      updates.resourceStorageIds = resourceStorageIds;
    }
    await ctx.db.patch(id, updates);
    await Promise.allSettled(
      removedStorageIds.map((storageId) => ctx.storage.delete(storageId)),
    );
  },
});

/**
 * Delete lesson
 */
export const remove = mutation({
  args: { id: v.id("lessons") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const lesson = await ctx.db.get(args.id);
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    const isAuthorized = await canModifyCurriculumContent(
      ctx,
      user._id,
      lesson.curriculumId,
    );
    if (!isAuthorized) {
      throw new Error("Not authorized to delete this lesson.");
    }

    const recordedLesson = await ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.id))
      .first();
    if (recordedLesson) {
      throw new ConvexError("RECORDED_LESSON_CANNOT_BE_DELETED");
    }

    // Delete resources from storage
    if (lesson.resourceStorageIds) {
      for (const storageId of lesson.resourceStorageIds) {
        try {
          await ctx.storage.delete(storageId);
        } catch (error) {
          console.warn(`Failed to delete resource ${storageId}:`, error);
        }
      }
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Bulk reorder lessons
 * Useful for drag-and-drop interfaces
 */
export const reorder = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("lessons"),
        order: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (args.updates.length === 0) return;

    const lessons = await Promise.all(
      args.updates.map((update) => ctx.db.get(update.id)),
    );
    const firstLesson = lessons[0];
    if (!firstLesson) throw new Error("Lesson not found");
    if (
      lessons.some(
        (lesson) => !lesson || lesson.curriculumId !== firstLesson.curriculumId,
      )
    ) {
      throw new ConvexError("INVALID_REORDER_REQUEST");
    }

    const isAuthorized = await canModifyCurriculumContent(
      ctx,
      user._id,
      firstLesson.curriculumId,
    );
    if (!isAuthorized) {
      throw new Error("Not authorized to reorder these lessons.");
    }

    await Promise.all(
      args.updates.map((update) =>
        ctx.db.patch(update.id, { order: update.order }),
      ),
    );
  },
});

/**
 * Duplicate lesson
 * Creates a copy with incremented order
 */
export const duplicate = mutation({
  args: {
    id: v.id("lessons"),
    newTitle: v.optional(v.string()),
  },
  returns: v.id("lessons"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const original = await ctx.db.get(args.id);
    if (!original) {
      throw new Error("Lesson not found");
    }

    const isAuthorized = await canModifyCurriculumContent(
      ctx,
      user._id,
      original.curriculumId,
    );
    if (!isAuthorized) {
      throw new Error("Not authorized to duplicate this lesson.");
    }

    // Get max order to place duplicate at end
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) =>
        q.eq("curriculumId", original.curriculumId),
      )
      .collect();

    const maxOrder = lessons.reduce((max, l) => Math.max(max, l.order), 0);

    return await ctx.db.insert("lessons", {
      curriculumId: original.curriculumId,
      title: args.newTitle || `${original.title} (Copy)`,
      description: original.description,
      content: original.content,
      order: maxOrder + 1,
      // Storage objects are owned by one lesson. Reusing IDs would make deleting
      // either lesson break the other's attachments.
      resourceStorageIds: undefined,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});
