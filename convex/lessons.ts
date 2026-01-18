import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { Id } from "./_generated/dataModel";

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
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      return await ctx.db
        .query("lessons")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
        .collect();
    }

    // Default: only active lessons, sorted by order
    return await ctx.db
      .query("lessons")
      .withIndex("by_curriculum_active", (q) => 
        q.eq("curriculumId", args.curriculumId).eq("isActive", true)
      )
      .collect();
  },
});

/**
 * Get single lesson by ID
 */
export const get = query({
  args: { id: v.id("lessons") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get lesson with resource URLs
 * Resolves storage IDs to actual URLs
 */
export const getWithResources = query({
  args: { id: v.id("lessons") },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.id);
    if (!lesson) return null;

    let resourceUrls: string[] = [];
    
    if (lesson.resourceStorageIds && lesson.resourceStorageIds.length > 0) {
      resourceUrls = await Promise.all(
        lesson.resourceStorageIds.map(async (storageId) => {
          const url = await ctx.storage.getUrl(storageId);
          return url || "";
        })
      );
    }

    return {
      ...lesson,
      resourceUrls: resourceUrls.filter(url => url !== ""),
    };
  },
});

/**
 * Generate upload URL for lesson resources
 */
export const generateResourceUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
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
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Teachers and admins can create lessons
    if (!["teacher", "admin", "superadmin"].includes(user.role)) {
      throw new Error("Only teachers and administrators can create lessons");
    }

    // Verify curriculum exists
    const curriculum = await ctx.db.get(args.curriculumId);
    if (!curriculum) {
      throw new Error("Curriculum not found");
    }

    // If Teacher, verify they are assigned to this curriculum
    if (user.role === "teacher") {
      await verifyTeacherAccess(ctx, user._id, args.curriculumId);
    }

    // Calculate order if not provided
    let order = args.order;
    if (order === undefined) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
        .collect();
      
      const maxOrder = lessons.reduce((max, l) => Math.max(max, l.order), 0);
      order = maxOrder + 1;
    }

    return await ctx.db.insert("lessons", {
      curriculumId: args.curriculumId,
      title: args.title,
      description: args.description,
      content: args.content,
      order,
      resourceStorageIds: args.resourceStorageIds,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
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
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate role
    if (!["teacher", "admin", "superadmin"].includes(user.role)) {
      throw new Error("Only teachers and administrators can update lessons");
    }

    const lesson = await ctx.db.get(args.id);
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    // If Teacher, verify they are assigned to this curriculum
    if (user.role === "teacher") {
      await verifyTeacherAccess(ctx, user._id, lesson.curriculumId);
    }

    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

/**
 * Delete lesson
 */
export const remove = mutation({
  args: { id: v.id("lessons") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Only admins usually delete, but if you allow teachers:
    if (user.role === "teacher") {
      const lesson = await ctx.db.get(args.id);
      if (lesson) await verifyTeacherAccess(ctx, user._id, lesson.curriculumId);
    } else if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can delete lessons");
    }

    const lesson = await ctx.db.get(args.id);
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    // Check if lesson is scheduled
    const schedules = await ctx.db
      .query("classSchedule")
      .filter((q) => q.eq(q.field("lessonId"), args.id))
      .collect();

    if (schedules.length > 0) {
      throw new Error(
        `Cannot delete lesson with ${schedules.length} scheduled session(s). ` +
        `Remove from schedule first.`
      );
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
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Teachers and admins can reorder lessons
    if (!["teacher", "admin", "superadmin"].includes(user.role)) {
      throw new Error("Only teachers and administrators can reorder lessons");
    }

    await Promise.all(
      args.updates.map((update) => 
        ctx.db.patch(update.id, { order: update.order })
      )
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
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (!["teacher", "admin", "superadmin"].includes(user.role)) {
      throw new Error("Only teachers and administrators can duplicate lessons");
    }

    const original = await ctx.db.get(args.id);
    if (!original) {
      throw new Error("Lesson not found");
    }

    // Get max order to place duplicate at end
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", original.curriculumId))
      .collect();
    
    const maxOrder = lessons.reduce((max, l) => Math.max(max, l.order), 0);

    return await ctx.db.insert("lessons", {
      curriculumId: original.curriculumId,
      title: args.newTitle || `${original.title} (Copy)`,
      description: original.description,
      content: original.content,
      order: maxOrder + 1,
      resourceStorageIds: original.resourceStorageIds, // Reuse same files
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

/**
 * Helper: Verify teacher access to curriculum
 */
async function verifyTeacherAccess(ctx: any, teacherId: Id<"users">, curriculumId: Id<"curriculums">) {
  const hasClass = await ctx.db
    .query("classes")
    .withIndex("by_teacher", (q: any) => q.eq("teacherId", teacherId).eq("isActive", true))
    .filter((q: any) => q.eq(q.field("curriculumId"), curriculumId))
    .first();

  if (!hasClass) {
    throw new Error("You are not assigned to any class using this curriculum.");
  }
}