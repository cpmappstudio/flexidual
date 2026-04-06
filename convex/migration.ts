// convex/migration.ts
import { v } from "convex/values";
import { mutation, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// --- YOUR ORIGINAL MIGRATIONS ---

export const importCurriculum = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    schoolId: v.optional(v.id("schools")),
    gradeCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const adminAssignment = await ctx.db
      .query("roleAssignments")
      .filter(q => q.or(
        q.eq(q.field("role"), "superadmin"),
        q.eq(q.field("role"), "admin")
      ))
      .first();
    const createdBy = adminAssignment?.userId ?? (await ctx.db.query("users").first())!._id;

    return await ctx.db.insert("curriculums", {
      title: args.title,
      description: args.description,
      code: args.code,
      color: "#3b82f6",
      isActive: args.isActive,
      createdAt: args.createdAt,
      createdBy,
      schoolId: args.schoolId,
      gradeCodes: args.gradeCodes,
    });
  },
});

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
    const adminAssignment = await ctx.db
      .query("roleAssignments")
      .filter(q => q.or(
        q.eq(q.field("role"), "superadmin"),
        q.eq(q.field("role"), "admin")
      ))
      .first();
    const createdBy = adminAssignment?.userId ?? (await ctx.db.query("users").first())!._id;

    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
      .collect();
    
    let currentOrder = existingLessons.reduce((max, l) => Math.max(max, l.order), 0);

    for (const item of args.lessons) {
      currentOrder++;
      await ctx.db.insert("lessons", {
        curriculumId: args.curriculumId,
        title: item.title,
        description: item.description,
        content: item.content,
        order: currentOrder, 
        isActive: item.isActive,
        createdAt: item.createdAt,
        createdBy: createdBy,
      });
    }
    
    return { count: args.lessons.length };
  },
});

export const migrateLessonIdToArray = internalMutation({
  handler: async (ctx) => {
    const schedules = await ctx.db.query("classSchedule").collect();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const schedule of schedules) {
      const doc = schedule as any;
      if (doc.lessonIds !== undefined) {
        skippedCount++;
        continue;
      }
      if (doc.lessonId !== undefined) {
        await ctx.db.patch(schedule._id, { lessonIds: [doc.lessonId] });
        migratedCount++;
      } else {
        await ctx.db.patch(schedule._id, { lessonIds: [] });
        migratedCount++;
      }
    }
    return { success: true, migratedCount, skippedCount, totalProcessed: schedules.length };
  },
});

export const clearLessonsFromRecurring = internalMutation({
  handler: async (ctx) => {
    const schedules = await ctx.db
      .query("classSchedule")
      .filter((q) => q.eq(q.field("isRecurring"), true))
      .collect();
    let clearedCount = 0;
    for (const schedule of schedules) {
      if (schedule.lessonIds && schedule.lessonIds.length > 0) {
        await ctx.db.patch(schedule._id, { lessonIds: undefined });
        clearedCount++;
      }
    }
    return { success: true, clearedCount };
  },
});

export const syncAllUsersToClerk = internalAction({
  handler: async (ctx) => {
    // Requires an internal query in users.ts: 
    // export const getAllUsersInternal = internalQuery({ handler: async (ctx) => await ctx.db.query("users").collect() });
    const users = await ctx.runQuery(internal.users.getAllUsersInternal); 
    
    for (const user of users) {
      if (!user.clerkId.startsWith("temp_")) {
        await ctx.runAction(internal.roleAssignments.syncRolesToClerk, {
          userId: user._id,
          clerkId: user.clerkId,
        });
      }
    }
  }
});

export const elevateToSuperadmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // 1. Find your user record
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) throw new Error(`User with email ${args.email} not found. Please log in first.`);

    // 2. Check if already superadmin
    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("orgType"), "system"))
      .first();

    if (existing && existing.role === "superadmin") {
      return "User is already a Superadmin!";
    }

    // 3. Remove all existing role assignments — superadmin supersedes everything
    const allAssignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const a of allAssignments) {
      await ctx.db.delete(a._id);
    }

    // 4. Grant system-wide Superadmin access
    await ctx.db.insert("roleAssignments", {
      userId: user._id,
      orgType: "system",
      role: "superadmin",
      assignedAt: Date.now(),
    });

    return `Success! ${args.email} is now a Superadmin. Next: Run healAllUserRoles to sync Clerk metadata.`;
  },
});