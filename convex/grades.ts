import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./users";
import { canAccessSchool, canManageInstitution } from "./permissions";
import { createGradeCode } from "../lib/grades";
import {
  getInstitutionGrades,
  resolveSchoolId,
  validateGradeCodes,
} from "./model/grades";
import { listInstitutionStudentMemberships } from "./model/membership";

const gradeValidator = v.object({
  _id: v.id("institutionGrades"),
  _creationTime: v.number(),
  schoolId: v.id("schools"),
  code: v.string(),
  name: v.string(),
  order: v.number(),
  createdAt: v.number(),
  createdBy: v.id("users"),
});

async function assertCanManage(
  ctx: MutationCtx,
  userId: Id<"users">,
  schoolId: Id<"schools">,
) {
  if (!(await canManageInstitution(ctx, userId, schoolId))) {
    throw new ConvexError("PERMISSION_DENIED");
  }
}

async function applyOrder(
  ctx: MutationCtx,
  grades: Doc<"institutionGrades">[],
) {
  await Promise.all(
    grades.map((grade, order) =>
      grade.order === order ? null : ctx.db.patch(grade._id, { order }),
    ),
  );
}

export const list = query({
  args: { schoolId: v.id("schools") },
  returns: v.array(gradeValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canAccessSchool(ctx, user._id, args.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    return await getInstitutionGrades(ctx, args.schoolId);
  },
});

export const validateForOrganization = internalQuery({
  args: {
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),
    orgId: v.optional(v.string()),
    codes: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const schoolId = await resolveSchoolId(ctx, args.orgType, args.orgId);
    return schoolId
      ? await validateGradeCodes(ctx, schoolId, args.codes)
      : args.codes;
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    position: v.number(),
  },
  returns: v.id("institutionGrades"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCanManage(ctx, user._id, args.schoolId);
    const name = args.name.trim();
    const baseCode = createGradeCode(name);
    if (name.length < 1 || name.length > 80 || !baseCode) {
      throw new ConvexError("INVALID_GRADE_NAME");
    }

    const grades = await getInstitutionGrades(ctx, args.schoolId);
    if (
      grades.some((grade) => grade.name.toLowerCase() === name.toLowerCase())
    ) {
      throw new ConvexError("DUPLICATE_GRADE_NAME");
    }
    if (!Number.isInteger(args.position)) {
      throw new ConvexError("INVALID_GRADE_POSITION");
    }
    let code = baseCode;
    let suffix = 2;
    const codes = new Set(grades.map((grade) => grade.code));
    while (codes.has(code)) code = `${baseCode.slice(0, 28)}-${suffix++}`;

    const position = Math.max(0, Math.min(args.position - 1, grades.length));
    const id = await ctx.db.insert("institutionGrades", {
      schoolId: args.schoolId,
      code,
      name,
      order: position,
      createdAt: Date.now(),
      createdBy: user._id,
    });
    const created = await ctx.db.get(id);
    await applyOrder(ctx, [
      ...grades.slice(0, position),
      created!,
      ...grades.slice(position),
    ]);
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("institutionGrades"),
    name: v.string(),
    position: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const grade = await ctx.db.get(args.id);
    if (!grade) throw new ConvexError("GRADE_NOT_FOUND");
    await assertCanManage(ctx, user._id, grade.schoolId);
    const name = args.name.trim();
    if (name.length < 1 || name.length > 80) {
      throw new ConvexError("INVALID_GRADE_NAME");
    }

    const grades = (await getInstitutionGrades(ctx, grade.schoolId)).filter(
      (item) => item._id !== grade._id,
    );
    if (grades.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError("DUPLICATE_GRADE_NAME");
    }
    if (!Number.isInteger(args.position)) {
      throw new ConvexError("INVALID_GRADE_POSITION");
    }
    const position = Math.max(0, Math.min(args.position - 1, grades.length));
    const updated = { ...grade, name };
    await ctx.db.patch(grade._id, { name });
    await applyOrder(ctx, [
      ...grades.slice(0, position),
      updated,
      ...grades.slice(position),
    ]);
    return null;
  },
});

export const reorder = mutation({
  args: {
    schoolId: v.id("schools"),
    ids: v.array(v.id("institutionGrades")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    await assertCanManage(ctx, user._id, args.schoolId);
    const grades = await getInstitutionGrades(ctx, args.schoolId);
    const byId = new Map(grades.map((grade) => [grade._id, grade]));
    if (
      args.ids.length !== grades.length ||
      new Set(args.ids).size !== grades.length ||
      args.ids.some((id) => !byId.has(id))
    ) {
      throw new ConvexError("INVALID_GRADE_ORDER");
    }
    await applyOrder(
      ctx,
      args.ids.map((id) => byId.get(id)!),
    );
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("institutionGrades") },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const grade = await ctx.db.get(args.id);
    if (!grade) return { deleted: true };
    await assertCanManage(ctx, user._id, grade.schoolId);

    const curriculums = await ctx.db
      .query("curriculums")
      .withIndex("by_school", (q) => q.eq("schoolId", grade.schoolId))
      .collect();
    if (curriculums.some((item) => item.gradeCodes?.includes(grade.code))) {
      return { deleted: false };
    }
    const curriculumIds = new Set(curriculums.map((item) => item._id));
    const classes = await ctx.db
      .query("classes")
      .withIndex("by_grade", (q) => q.eq("gradeCode", grade.code))
      .collect();
    if (classes.some((item) => curriculumIds.has(item.curriculumId))) {
      return { deleted: false };
    }

    const assigned = await ctx.db
      .query("roleAssignments")
      .withIndex("by_school_role_grade", (q) =>
        q
          .eq("schoolId", grade.schoolId)
          .eq("role", "student")
          .eq("gradeCode", grade.code),
      )
      .first();
    if (assigned) return { deleted: false };

    // ponytail: remove this legacy check after the production membership backfill.
    const legacyStudentIds = new Set(
      (await listInstitutionStudentMemberships(ctx, grade.schoolId))
        .filter((assignment) => assignment.gradeCode === undefined)
        .map((assignment) => assignment.userId),
    );
    const legacyUsers = await ctx.db
      .query("users")
      .withIndex("by_grade", (q) => q.eq("grade", grade.code))
      .collect();
    if (legacyUsers.some((item) => legacyStudentIds.has(item._id))) {
      return { deleted: false };
    }

    await ctx.db.delete(grade._id);
    await applyOrder(
      ctx,
      (await getInstitutionGrades(ctx, grade.schoolId)).filter(
        (item) => item._id !== grade._id,
      ),
    );
    return { deleted: true };
  },
});
