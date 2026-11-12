import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  DEFAULT_GRADING_POLICY,
  type GradingConfiguration,
  isValidPoints,
} from "../../lib/grading";

export const gradingPolicyValidator = v.object({
  scaleMax: v.number(),
  decimalPlaces: v.number(),
  defaultMaxPoints: v.number(),
  passingPercentage: v.optional(v.number()),
});

export const gradingConfigurationValidator = gradingPolicyValidator
  .omit("defaultMaxPoints")
  .extend({ maxPoints: v.number() });

export const gradeResultValidator = v.object({
  points: v.number(),
  // Older results store points on the activity's scale.
  institutionalScale: v.optional(v.literal(true)),
  comment: v.optional(v.string()),
  submissionRevision: v.number(),
  authorId: v.id("users"),
  updatedAt: v.number(),
});

export const gradeViewValidator = gradeResultValidator
  .omit("institutionalScale")
  .extend({ institutionalPoints: v.optional(v.number()) });

export function projectGrade<T extends Infer<typeof gradeResultValidator>>(
  { institutionalScale, points, ...result }: T,
  { scaleMax, maxPoints }: GradingConfiguration,
) {
  return {
    ...result,
    // Keep the old API in activity units without rounding away the new score.
    points: institutionalScale ? (points * maxPoints) / scaleMax : points,
    institutionalPoints: institutionalScale ? points : undefined,
  };
}

export const gradeEditorStateValidator = v.object({
  grading: v.union(gradingConfigurationValidator, v.null()),
  version: v.number(),
  draft: v.union(gradeViewValidator, v.null()),
  published: v.union(gradeViewValidator, v.null()),
  needsReview: v.boolean(),
});

export function findTaskGrade(
  ctx: QueryCtx,
  taskId: Id<"courseTasks">,
  studentId: Id<"users">,
) {
  return ctx.db
    .query("courseTaskGrades")
    .withIndex("by_taskId_and_studentId", (q) =>
      q.eq("taskId", taskId).eq("studentId", studentId),
    )
    .unique();
}

export function projectGradeEditorState(
  grading: GradingConfiguration | undefined,
  grade: Doc<"courseTaskGrades"> | null,
  submissionRevision: number,
  canManage: boolean,
) {
  return {
    grading: grading ?? null,
    version: canManage ? (grade?.version ?? 0) : 0,
    draft:
      canManage && grade?.draft && grading
        ? projectGrade(grade.draft, grading)
        : null,
    published:
      grade?.published && grading
        ? projectGrade(grade.published, grading)
        : null,
    needsReview:
      grade?.published !== undefined &&
      grade.published.submissionRevision !== submissionRevision,
  };
}

export async function getCourseGradingPolicy(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
) {
  const [campus, curriculum] = await Promise.all([
    course.campusId ? ctx.db.get("campuses", course.campusId) : null,
    ctx.db.get("curriculums", course.curriculumId),
  ]);
  const schoolId = campus?.schoolId ?? curriculum?.schoolId;
  const school = schoolId ? await ctx.db.get("schools", schoolId) : null;
  if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
  return school.gradingPolicy ?? DEFAULT_GRADING_POLICY;
}

export async function resolveTaskGrading(
  ctx: MutationCtx,
  course: Doc<"classes">,
  requested: { maxPoints: number } | null | undefined,
  task?: Doc<"courseTasks">,
) {
  if (requested === undefined) return task?.grading;
  // Keep the historical scale even when the institution's defaults change.
  if (requested && requested.maxPoints === task?.grading?.maxPoints)
    return task.grading;
  if (
    task &&
    (await ctx.db
      .query("courseTaskGrades")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", task._id))
      .first())
  )
    throw new ConvexError("TASK_GRADING_LOCKED");
  if (requested === null) return undefined;
  const policy = await getCourseGradingPolicy(ctx, course);
  if (
    requested.maxPoints <= 0 ||
    !isValidPoints(requested.maxPoints, 1_000_000, policy.decimalPlaces)
  )
    throw new ConvexError("INVALID_TASK_GRADING");
  const passingPercentage = task?.grading
    ? task.grading.passingPercentage
    : policy.passingPercentage;
  return {
    maxPoints: requested.maxPoints,
    scaleMax: policy.scaleMax,
    decimalPlaces: policy.decimalPlaces,
    ...(passingPercentage === undefined ? {} : { passingPercentage }),
  };
}
