import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List all curriculums with optional inactive filter
 */
export const list = query({
  args: { 
    includeInactive: v.optional(v.boolean()) 
  },
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      return await ctx.db
        .query("curriculums")
        .order("desc")
        .collect();
    }
    
    // Default: only active curriculums
    return await ctx.db
      .query("curriculums")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .collect();
  },
});

/**
 * Get single curriculum by ID
 */
export const get = query({
  args: { id: v.id("curriculums") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
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

    // Validate: Code must be unique if changing
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
    force: v.optional(v.boolean()), // Force delete even if classes exist
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