import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { GRADE_VALUES } from "../lib/types/academic";
import { ConvexError } from "convex/values";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List curriculums with strict role-based access
 * - Admins: See all
 * - Teachers/Tutors: Only see curriculums for classes they are assigned to
 */
export const list = query({
  args: { 
    includeInactive: v.optional(v.boolean()) 
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;

    // 1. ADMINS: Full Access
    if (["admin", "superadmin"].includes(user.role)) {
      if (args.includeInactive) {
        return await ctx.db.query("curriculums").order("desc").collect();
      }
      return await ctx.db
        .query("curriculums")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .order("desc")
        .collect();
    }

    // 2. TEACHERS/TUTORS: Restricted Access
    if (["teacher", "tutor"].includes(user.role)) {
      // Find all active classes assigned to this teacher
      const myClasses = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => 
          q.eq("teacherId", user._id).eq("isActive", true)
        )
        .collect();
      
      // Extract unique curriculum IDs
      const myCurriculumIds = Array.from(new Set(myClasses.map(c => c.curriculumId)));

      if (myCurriculumIds.length === 0) return [];

      // Fetch the actual curriculum documents
      const curriculums = await Promise.all(
        myCurriculumIds.map(id => ctx.db.get(id))
      );

      // Filter nulls and strictly respect isActive unless specifically asked otherwise (though teachers usually shouldn't see inactive)
      return curriculums
        .filter((c): c is NonNullable<typeof c> => c !== null && (args.includeInactive || c.isActive))
        .sort((a, b) => b.createdAt - a.createdAt);
    }

    // Students/Others: No access by default (or implement student logic if needed)
    return [];
  },
});

/**
 * Get single curriculum by ID with ownership check
 */
export const get = query({
  args: { id: v.id("curriculums") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;
    const curriculum = await ctx.db.get(args.id);

    if (!curriculum) return null;

    // 1. ADMINS: Allow
    if (["admin", "superadmin"].includes(user.role)) {
      return curriculum;
    }

    // 2. TEACHERS: Check assignment
    if (["teacher", "tutor"].includes(user.role)) {
      // Check if they have ANY active class with this curriculum
      const hasAccess = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => q.eq("teacherId", user._id).eq("isActive", true))
        .filter(q => q.eq(q.field("curriculumId"), args.id))
        .first();

      if (!hasAccess) return null; 
      return curriculum;
    }

    return null;
  },
});

/**
 * Get curriculum with lesson count
 * Useful for dashboard/admin views
 */
export const getWithStats = query({
  args: { id: v.id("curriculums") },
  handler: async (ctx, args) => {
    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) return null;

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum_active", (q) => 
        q.eq("curriculumId", args.id).eq("isActive", true)
      )
      .collect();

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.id))
      .collect();

    return {
      ...curriculum,
      stats: {
        lessonCount: lessons.length,
        activeClassCount: classes.filter(c => c.isActive).length,
        totalClassCount: classes.length,
      }
    };
  },
});

/**
 * Check if curriculum code is unique
 */
export const isCodeAvailable = query({
  args: { 
    code: v.string(),
    excludeId: v.optional(v.id("curriculums"))
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("curriculums")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!existing) return true;
    if (args.excludeId && existing._id === args.excludeId) return true;
    
    return false;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new curriculum
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    gradeCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Only admins can create curriculums
    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can create curriculums");
    }

    // Validate: Code must be unique if provided
    if (args.code) {
      const isAvailable = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .first();
      
      if (isAvailable) {
        throw new Error(`Curriculum code "${args.code}" already exists`);
      }
    }

    if (args.gradeCodes) {
      const invalidCodes = args.gradeCodes.filter(g => !(GRADE_VALUES as readonly string[]).includes(g));
      
      if (invalidCodes.length > 0) {
        throw new ConvexError({
          code: "INVALID_GRADE",
          grades: invalidCodes.join(", ")
        });
      }
    }

    return await ctx.db.insert("curriculums", {
      title: args.title,
      description: args.description,
      code: args.code,
      color: args.color || "#3b82f6", // Default blue
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

/**
 * Batch create curriculums
 * Returns status for each item to support "Staging Area" pattern
 */
export const createBatch = mutation({
  args: {
    curriculums: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      code: v.optional(v.string()),
      gradeCodes: v.optional(v.array(v.string())),
    }))
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can create curriculums");
    }

    const results = [];

    for (const item of args.curriculums) {
      try {
        // Uniqueness check for code
        if (item.code) {
          const existing = await ctx.db
            .query("curriculums")
            .withIndex("by_code", (q) => q.eq("code", item.code))
            .first();
          
          if (existing) {
            results.push({ title: item.title, status: "error", reason: `Code '${item.code}' already taken` });
            continue;
          }
        }

        if (item.gradeCodes && !item.gradeCodes.every(g => (GRADE_VALUES as readonly string[]).includes(g))) {
          results.push({ 
            title: item.title, 
            status: "error", 
            reason: `Invalid grade code(s) found. Allowed: ${GRADE_VALUES.join(", ")}` 
          });
          continue;
        }

        await ctx.db.insert("curriculums", {
          title: item.title,
          description: item.description,
          code: item.code,
          color: "#3b82f6",
          gradeCodes: item.gradeCodes,
          isActive: true,
          createdAt: Date.now(),
          createdBy: user._id,
        });

        results.push({ title: item.title, status: "success" });
      } catch (e) {
        results.push({ title: item.title, status: "error", reason: (e as Error).message });
      }
    }

    return results;
  },
});

/**
 * Update curriculum
 */
export const update = mutation({
  args: {
    id: v.id("curriculums"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    gradeCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Only admins can update curriculums
    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can update curriculums");
    }

    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) {
      throw new Error("Curriculum not found");
    }

    if (args.gradeCodes) {
      const invalidCodes = args.gradeCodes.filter(g => !(GRADE_VALUES as readonly string[]).includes(g));
      
      if (invalidCodes.length > 0) {
        throw new ConvexError({
          code: "INVALID_GRADE",
          grades: invalidCodes.join(", ")
        });
      }
    }

    if (args.code && args.code !== curriculum.code) {
      const existing = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .first();
      
      if (existing && existing._id !== args.id) {
        throw new Error(`Curriculum code "${args.code}" already exists`);
      }
    }

    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

/**
 * Delete curriculum
 * WARNING: This cascades to lessons. Use with caution.
 */
export const remove = mutation({
  args: { 
    id: v.id("curriculums"),
    force: v.optional(v.boolean()), 
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Only superadmins can delete curriculums
    if (user.role !== "superadmin") {
      throw new Error("Only superadmins can delete curriculums");
    }

    // Check for active classes
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.id))
      .collect();

    const activeClasses = classes.filter(c => c.isActive);
    
    if (activeClasses.length > 0 && !args.force) {
      throw new Error(
        `Cannot delete curriculum with ${activeClasses.length} active class(es). ` +
        `Deactivate classes first or use force=true.`
      );
    }

    // Delete the curriculum
    await ctx.db.delete(args.id);
    
    // Cascade delete lessons
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.id))
      .collect();
      
    for (const lesson of lessons) {
      // Delete lesson resources from storage
      if (lesson.resourceStorageIds) {
        for (const storageId of lesson.resourceStorageIds) {
          try {
            await ctx.storage.delete(storageId);
          } catch (error) {
            console.warn(`Failed to delete resource ${storageId}:`, error);
          }
        }
      }
      
      await ctx.db.delete(lesson._id);
    }
  },
});

/**
 * Archive curriculum (safer alternative to delete)
 */
export const archive = mutation({
  args: { id: v.id("curriculums") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can archive curriculums");
    }

    await ctx.db.patch(args.id, { isActive: false });
  },
});