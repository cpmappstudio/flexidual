// convex/migration.ts
import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * Migration helper to insert a curriculum without Auth checks.
 * Returns the new ID.
 */
export const importCurriculum = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // You might want to assign a system user ID here if you don't have one, 
    // or pass it in. For now, we'll try to find an admin or leave it null/placeholder
    // if your schema allows. Ideally, fetch your own user ID here.
    const admin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin").eq("isActive", true)).first();
    const createdBy = admin?._id ?? (await ctx.db.query("users").first())!._id;

    return await ctx.db.insert("curriculums", {
      title: args.title,
      description: args.description,
      code: args.code,
      color: "#3b82f6", // Default blue
      isActive: args.isActive,
      createdAt: args.createdAt,
      createdBy: createdBy,
    });
  },
});

/**
 * Batch insert lessons for a specific curriculum.
 * We assume the input 'lessons' array is ALREADY sorted by the client.
 */
export const importLessonsBatch = mutation({
  args: {
    curriculumId: v.id("curriculums"),
    lessons: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      content: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "admin").eq("isActive", true)).first();
    const createdBy = admin?._id ?? (await ctx.db.query("users").first())!._id;

    // 1. Get current max order to append correctly (starting at 1 if empty)
    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
      .collect();
    
    let currentOrder = existingLessons.reduce((max, l) => Math.max(max, l.order), 0);

    // 2. Insert sequentially
    for (const item of args.lessons) {
      currentOrder++;
      await ctx.db.insert("lessons", {
        curriculumId: args.curriculumId,
        title: item.title,
        description: item.description,
        content: item.content,
        order: currentOrder, // Linear order based on the sorted array passed in
        isActive: item.isActive,
        createdAt: item.createdAt,
        createdBy: createdBy,
      });
    }
    
    return { count: args.lessons.length };
  },
});