import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { ConvexError } from "convex/values";
import {
  hasSystemRole,
  canAccessCurriculumContent,
  canManageCurriculums,
} from "./permissions";
import type { Id } from "./_generated/dataModel";
import { validateGradeCodes } from "./model/grades";

const curriculumValidator = v.object({
  _id: v.id("curriculums"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  code: v.optional(v.string()),
  color: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
  gradeCodes: v.optional(v.array(v.string())),
  schoolId: v.optional(v.id("schools")),
});

function normalizeCurriculumTitle(value: string) {
  const title = value.trim();
  if (!title || title.length > 150) {
    throw new ConvexError("INVALID_CURRICULUM_TITLE");
  }
  return title;
}

function normalizeCurriculumCode(value?: string) {
  const code = value?.trim();
  if (code && code.length > 50) {
    throw new ConvexError("INVALID_CURRICULUM_CODE");
  }
  return code || undefined;
}

async function assertCurriculumCodeAvailable(
  ctx: MutationCtx,
  schoolId: Id<"schools"> | undefined,
  code: string | undefined,
  excludeId?: Id<"curriculums">,
) {
  if (!code) return;
  const existing = await ctx.db
    .query("curriculums")
    .withIndex("by_school_code", (q) =>
      q.eq("schoolId", schoolId).eq("code", code),
    )
    .first();
  if (existing && existing._id !== excludeId) {
    throw new ConvexError("CURRICULUM_CODE_IN_USE");
  }
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List curriculums with strict role-based access
 * - Superadmins: See all
 * - School Admins: See curriculums for their schools
 * - Campus staff: See the shared curriculum catalog for assigned campuses
 */
export const list = query({
  args: {
    includeInactive: v.optional(v.boolean()),
    schoolId: v.optional(v.id("schools")),
  },
  returns: v.union(v.array(curriculumValidator), v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    // 1. SUPERADMINS: Full Access (with optional school filter)
    if (isSuperAdmin) {
      if (args.schoolId) {
        return await ctx.db
          .query("curriculums")
          .withIndex("by_school", (q) => {
            const range = q.eq("schoolId", args.schoolId!);
            return args.includeInactive ? range : range.eq("isActive", true);
          })
          .order("desc")
          .collect();
      }

      if (!args.includeInactive) {
        return await ctx.db
          .query("curriculums")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .order("desc")
          .collect();
      }

      return await ctx.db.query("curriculums").order("desc").collect();
    }

    // 2. Resolve Contextual Access (Admin of Schools & Taught Classes)

    // Find schools where they are an admin
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const adminAssignments = assignments.filter(
      (assignment) =>
        assignment.orgType === "school" && assignment.role === "admin",
    );
    const adminSchoolIds = adminAssignments.map((a) => a.orgId);

    // Campus staff can inspect the institution-wide catalog.
    const campusStaffAssignments = assignments.filter(
      (assignment) =>
        assignment.orgType === "campus" &&
        ["principal", "teacher", "tutor"].includes(assignment.role),
    );

    const staffCampuses = await Promise.all(
      campusStaffAssignments.map((a) => ctx.db.get(a.orgId as Id<"campuses">)),
    );
    const staffSchoolIds = staffCampuses
      .map((c) => c?.schoolId)
      .filter(Boolean);

    // Combine all valid school IDs for this user
    const validSchoolIds = [...new Set([...adminSchoolIds, ...staffSchoolIds])];

    // Find curriculums tied to active classes they teach
    const myClasses = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) =>
        q.eq("teacherId", user._id).eq("isActive", true),
      )
      .collect();
    const taughtCurriculumIds = myClasses.map((c) => c.curriculumId);

    const schoolIds = args.schoolId
      ? validSchoolIds.filter((schoolId) => schoolId === args.schoolId)
      : validSchoolIds;
    const [schoolCurriculums, taughtCurriculums] = await Promise.all([
      Promise.all(
        schoolIds.map((schoolId) =>
          ctx.db
            .query("curriculums")
            .withIndex("by_school", (q) =>
              q.eq("schoolId", schoolId as Id<"schools">),
            )
            .collect(),
        ),
      ),
      Promise.all(taughtCurriculumIds.map((id) => ctx.db.get(id))),
    ]);
    const accessible = new Map(
      [...schoolCurriculums.flat(), ...taughtCurriculums]
        .filter((item) => item !== null)
        .map((item) => [item!._id, item!]),
    );

    return [...accessible.values()].filter(
      (curriculum) =>
        (args.includeInactive || curriculum.isActive) &&
        (!args.schoolId || curriculum.schoolId === args.schoolId),
    );
  },
});

/**
 * Get single curriculum by ID with contextual ownership check
 */
export const get = query({
  args: { id: v.id("curriculums") },
  returns: v.union(curriculumValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;

    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) return null;

    return (await canAccessCurriculumContent(ctx, user._id, args.id))
      ? curriculum
      : null;
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
  returns: v.id("curriculums"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const title = normalizeCurriculumTitle(args.title);
    const code = normalizeCurriculumCode(args.code);

    const isAuthorized = await canManageCurriculums(
      ctx,
      user._id,
      args.schoolId,
    );
    if (!isAuthorized) {
      throw new Error(
        "Only administrators can create curriculums for this school",
      );
    }

    await assertCurriculumCodeAvailable(ctx, args.schoolId, code);

    if (args.gradeCodes && args.schoolId) {
      const invalidCodes = await validateGradeCodes(
        ctx,
        args.schoolId,
        args.gradeCodes,
      );
      if (invalidCodes.length > 0) {
        throw new ConvexError({
          code: "INVALID_GRADE",
          grades: invalidCodes.join(", "),
        });
      }
    }

    return await ctx.db.insert("curriculums", {
      title,
      schoolId: args.schoolId,
      description: args.description,
      code,
      color: args.color || "#3b82f6",
      gradeCodes: args.gradeCodes ?? [],
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
    orgType: v.optional(
      v.union(v.literal("system"), v.literal("school"), v.literal("campus")),
    ),
    orgId: v.optional(v.string()),
    curriculums: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        code: v.optional(v.string()),
        gradeCodes: v.optional(v.array(v.string())),
      }),
    ),
  },
  returns: v.object({
    count: v.number(),
    ids: v.array(v.id("curriculums")),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (args.curriculums.length === 0 || args.curriculums.length > 50) {
      throw new ConvexError("INVALID_CURRICULUM_BATCH");
    }

    let targetSchoolId: Id<"schools"> | undefined = undefined;

    if (args.orgType === "school" && args.orgId) {
      targetSchoolId = args.orgId as Id<"schools">;
    } else if (args.orgType === "campus" && args.orgId) {
      const campus = await ctx.db.get(args.orgId as Id<"campuses">);
      targetSchoolId = campus?.schoolId;
    }

    if (!targetSchoolId) throw new ConvexError("INSTITUTION_REQUIRED");
    if (!(await canManageCurriculums(ctx, user._id, targetSchoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const curriculums = args.curriculums.map((item) => ({
      ...item,
      title: normalizeCurriculumTitle(item.title),
      code: normalizeCurriculumCode(item.code),
      gradeCodes: [...new Set(item.gradeCodes ?? [])],
    }));
    const codes = curriculums.flatMap((item) =>
      item.code ? [item.code] : [],
    );
    if (new Set(codes).size !== codes.length) {
      throw new ConvexError("CURRICULUM_CODE_IN_USE");
    }
    await Promise.all(
      codes.map((code) =>
        assertCurriculumCodeAvailable(ctx, targetSchoolId, code),
      ),
    );

    const invalidCodes = await validateGradeCodes(
      ctx,
      targetSchoolId,
      [...new Set(curriculums.flatMap((item) => item.gradeCodes))],
    );
    if (invalidCodes.length > 0) {
      throw new ConvexError({
        code: "INVALID_GRADE",
        grades: invalidCodes.join(", "),
      });
    }

    const createdIds = [];
    for (const item of curriculums) {
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) throw new Error("Curriculum not found");

    const isAuthorized = await canManageCurriculums(
      ctx,
      user._id,
      curriculum.schoolId,
    );
    if (!isAuthorized) {
      throw new Error("Only administrators can update curriculums");
    }

    const title =
      args.title === undefined
        ? undefined
        : normalizeCurriculumTitle(args.title);
    const code =
      args.code === undefined ? undefined : normalizeCurriculumCode(args.code);
    if (args.code !== undefined && code !== curriculum.code) {
      await assertCurriculumCodeAvailable(
        ctx,
        curriculum.schoolId,
        code,
        curriculum._id,
      );
    }

    const gradeCodes =
      args.gradeCodes === undefined
        ? undefined
        : [...new Set(args.gradeCodes)];

    if (gradeCodes && curriculum.schoolId) {
      const invalidCodes = await validateGradeCodes(
        ctx,
        curriculum.schoolId,
        gradeCodes,
      );
      if (invalidCodes.length > 0) {
        throw new ConvexError({
          code: "INVALID_GRADE",
          grades: invalidCodes.join(", "),
        });
      }
    }

    const { id, ...updates } = args;
    if (title !== undefined) updates.title = title;
    if (args.code !== undefined) updates.code = code;
    if (gradeCodes !== undefined) updates.gradeCodes = gradeCodes;
    await ctx.db.patch(id, updates);
    return null;
  },
});

/**
 * Delete curriculum
 * WARNING: This cascades to lessons. Use with caution.
 */
export const remove = mutation({
  args: { id: v.id("curriculums") },
  returns: v.union(
    v.object({ deleted: v.literal(true) }),
    v.object({
      deleted: v.literal(false),
      reason: v.literal("CURRICULUM_IN_USE"),
      classCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) return { deleted: true } as const;

    if (!(await canManageCurriculums(ctx, user._id, curriculum.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.id))
      .collect();

    if (classes.length > 0) {
      return {
        deleted: false,
        reason: "CURRICULUM_IN_USE",
        classCount: classes.length,
      } as const;
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
          try {
            await ctx.storage.delete(storageId);
          } catch {}
        }
      }
      await ctx.db.delete(lesson._id);
    }

    return { deleted: true } as const;
  },
});

/**
 * Archive curriculum (safer alternative to delete)
 */
export const archive = mutation({
  args: { id: v.id("curriculums") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const curriculum = await ctx.db.get(args.id);
    if (!curriculum) throw new Error("Curriculum not found");

    const isAuthorized = await canManageCurriculums(
      ctx,
      user._id,
      curriculum.schoolId,
    );
    if (!isAuthorized) {
      throw new Error("Only administrators can archive curriculums");
    }

    await ctx.db.patch(args.id, { isActive: false });
  },
});
