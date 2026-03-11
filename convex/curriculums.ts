import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { GRADE_VALUES } from "../lib/types/academic";
import { ConvexError } from "convex/values";
import { hasSystemRole, hasOrgRole, canManageCurriculums, isPrincipalOfSchool } from "./permissions";
import { Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List curriculums with strict role-based access
 * - Superadmins: See all
 * - School Admins: See curriculums for their schools
 * - Teachers/Tutors: Only see curriculums for active classes they teach
 */
export const list = query({
  args: { 
    includeInactive: v.optional(v.boolean()),
    schoolId: v.optional(v.id("schools")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    // 1. SUPERADMINS: Full Access (with optional school filter)
    if (isSuperAdmin) {
      if (args.schoolId) {
        const q = ctx.db.query("curriculums")
          .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!));
        if (!args.includeInactive) {
          return await q.filter((q) => q.eq(q.field("isActive"), true)).order("desc").collect();
        }
        return await q.order("desc").collect();
      }

      if (!args.includeInactive) {
        return await ctx.db.query("curriculums")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .order("desc").collect();
      }

      return await ctx.db.query("curriculums").order("desc").collect();
    }

    // 2. Resolve Contextual Access (Admin of Schools & Taught Classes)
    
    // Find schools where they are an admin
    const adminAssignments = await ctx.db.query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.and(q.eq(q.field("orgType"), "school"), q.eq(q.field("role"), "admin")))
      .collect();
    const adminSchoolIds = adminAssignments.map((a) => a.orgId);

    // Find schools where they are a principal
    const principalAssignments = await ctx.db.query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.and(q.eq(q.field("orgType"), "campus"), q.eq(q.field("role"), "principal")))
      .collect();
    
    const principalCampuses = await Promise.all(
        principalAssignments.map(a => ctx.db.get(a.orgId as Id<"campuses">))
    );
    const principalSchoolIds = principalCampuses.map(c => c?.schoolId).filter(Boolean);

    // Combine all valid school IDs for this user
    const validSchoolIds = [...new Set([...adminSchoolIds, ...principalSchoolIds])];

    // Find curriculums tied to active classes they teach
    const myClasses = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) => q.eq("teacherId", user._id).eq("isActive", true))
      .collect();
    const taughtCurriculumIds = myClasses.map((c) => c.curriculumId);

    // Fetch all curriculums and filter in memory based on contextual access
    const allCurriculums = await ctx.db.query("curriculums").order("desc").collect();

    return allCurriculums.filter((c) => {
      // Respect inactive filter
      if (!args.includeInactive && !c.isActive) return false;
      
      // Allow if they are an admin or principal of the curriculum's school network
      if (c.schoolId && validSchoolIds.includes(c.schoolId)) return true;
      
      // Allow if they actively teach this curriculum
      if (taughtCurriculumIds.some(id => id === c._id)) return true;
      
      return false;
    });
  },
});

/**
 * Get single curriculum by ID with contextual ownership check
 */
export const get = query({
  args: { id: v.id("curriculums") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;
    
    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) return null;

    // 1. Check Superadmin
    if (await hasSystemRole(ctx, user._id, ["superadmin"])) return curriculum;

    // 2. Check School Admin
    if (curriculum.schoolId) {
      const isSchoolAdmin = await hasOrgRole(ctx, user._id, curriculum.schoolId, "school", ["admin"]);
      if (isSchoolAdmin) return curriculum;
      
      const isPrincipal = await isPrincipalOfSchool(ctx, user._id, curriculum.schoolId);
      if (isPrincipal) return curriculum;
    }

    // 3. Check Teacher Assignment
    const isTeachingCurriculum = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) => q.eq("teacherId", user._id).eq("isActive", true))
      .filter((q) => q.eq(q.field("curriculumId"), args.id))
      .first();

    if (isTeachingCurriculum) return curriculum;

    return null; // Access denied
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
      .withIndex("by_curriculum_active", (q) => q.eq("curriculumId", args.id).eq("isActive", true))
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
    schoolId: v.optional(v.id("schools")), // NEW: Required for contextual RBAC, optional to not break legacy UI instantly
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    color: v.optional(v.string()),
    gradeCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const isAuthorized = await canManageCurriculums(ctx, user._id, args.schoolId);
    if (!isAuthorized) {
      throw new Error("Only administrators can create curriculums for this school");
    }

    if (args.code) {
      const isAvailable = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .first();
      
      if (isAvailable) throw new Error(`Curriculum code "${args.code}" already exists`);
    }

    if (args.gradeCodes) {
      const invalidCodes = args.gradeCodes.filter(g => !(GRADE_VALUES as readonly string[]).includes(g));
      if (invalidCodes.length > 0) {
        throw new ConvexError({ code: "INVALID_GRADE", grades: invalidCodes.join(", ") });
      }
    }

    return await ctx.db.insert("curriculums", {
      title: args.title,
      schoolId: args.schoolId,
      description: args.description,
      code: args.code,
      color: args.color || "#3b82f6",
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
    orgType: v.optional(v.union(v.literal("system"), v.literal("school"), v.literal("campus"))),
    orgId: v.optional(v.string()),
    curriculums: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      code: v.optional(v.string()),
      gradeCodes: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    let targetSchoolId: Id<"schools"> | undefined = undefined;

    if (args.orgType === "school" && args.orgId) {
        targetSchoolId = args.orgId as Id<"schools">;
    } else if (args.orgType === "campus" && args.orgId) {
        const campus = await ctx.db.get(args.orgId as Id<"campuses">);
        targetSchoolId = campus?.schoolId;
    }

    const createdIds = [];
    for (const item of args.curriculums) {
      const id = await ctx.db.insert("curriculums", {
        title: item.title,
        description: item.description,
        code: item.code,
        gradeCodes: item.gradeCodes,
        color: "#3b82f6",
        schoolId: targetSchoolId,
        isActive: true,
        createdAt: Date.now(),
        createdBy: user._id,
      });
      createdIds.push(id);
    }
    
    return { count: createdIds.length, ids: createdIds };
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

    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) throw new Error("Curriculum not found");

    const isAuthorized = await canManageCurriculums(ctx, user._id, curriculum.schoolId);
    if (!isAuthorized) {
      throw new Error("Only administrators can update curriculums");
    }

    if (args.gradeCodes) {
      const invalidCodes = args.gradeCodes.filter(g => !(GRADE_VALUES as readonly string[]).includes(g));
      if (invalidCodes.length > 0) throw new ConvexError({ code: "INVALID_GRADE" });
    }

    if (args.code && args.code !== curriculum.code) {
      const existing = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", args.code))
        .first();
      if (existing && existing._id !== args.id) throw new Error(`Curriculum code already exists`);
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

    // Strict Superadmin-only for hard deletes
    if (!(await hasSystemRole(ctx, user._id, ["superadmin"]))) {
      throw new Error("Only system superadmins can delete curriculums");
    }

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.id))
      .collect();

    const activeClasses = classes.filter(c => c.isActive);
    
    if (activeClasses.length > 0 && !args.force) {
      throw new Error(`Cannot delete curriculum with ${activeClasses.length} active class(es).`);
    }

    await ctx.db.delete(args.id);
    
    // Cascade delete lessons
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.id))
      .collect();
      
    for (const lesson of lessons) {
      if (lesson.resourceStorageIds) {
        for (const storageId of lesson.resourceStorageIds) {
          try { await ctx.storage.delete(storageId); } catch (e) {}
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

    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) throw new Error("Curriculum not found");

    const isAuthorized = await canManageCurriculums(ctx, user._id, curriculum.schoolId);
    if (!isAuthorized) {
      throw new Error("Only administrators can archive curriculums");
    }

    await ctx.db.patch(args.id, { isActive: false });
  },
});