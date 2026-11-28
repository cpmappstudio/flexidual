import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  GRADING_CATEGORIES,
  isValidGradingWeights,
  sameGradingWeights,
  type GradingCategory,
  type GradingWeights,
} from "../../lib/grading-weights";
import { getCourseGradingSchool } from "./grading";

export const gradingCategoryValidator = v.union(
  ...GRADING_CATEGORIES.map((category) => v.literal(category)),
);
export const gradingWeightsValidator = v.array(
  v.object({ category: gradingCategoryValidator, weightBps: v.number() }),
);
export const gradingWeightsFields = {
  gradingWeights: v.optional(gradingWeightsValidator),
  gradingWeightsVersion: v.optional(v.number()),
};

export function validateGradingWeights(weights: GradingWeights) {
  if (!isValidGradingWeights(weights))
    throw new ConvexError("INVALID_GRADING_WEIGHTS");
}

export function gradingWeightsUpdate(
  current: {
    gradingWeights?: GradingWeights;
    gradingWeightsVersion?: number;
  },
  requested: GradingWeights | null | undefined,
  expectedVersion?: number,
): { gradingWeights?: GradingWeights; gradingWeightsVersion?: number } {
  if (requested === undefined) return {};
  if (requested !== null) validateGradingWeights(requested);
  if (
    typeof expectedVersion !== "number" ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= Number.MAX_SAFE_INTEGER
  )
    throw new ConvexError("INVALID_GRADING_WEIGHTS_VERSION");
  if (sameGradingWeights(current.gradingWeights, requested)) return {};
  if ((current.gradingWeightsVersion ?? 0) !== expectedVersion)
    throw new ConvexError("GRADING_WEIGHTS_CHANGED");
  return {
    gradingWeights: requested ?? undefined,
    gradingWeightsVersion: expectedVersion + 1,
  };
}

export async function getCourseGradingWeights(
  ctx: QueryCtx,
  course: Doc<"classes">,
) {
  const school = await getCourseGradingSchool(ctx, course);
  return {
    weights: course.gradingWeights ?? school.gradingWeights ?? null,
    institutionalWeights: school.gradingWeights ?? null,
    overridden: course.gradingWeights !== undefined,
    version: course.gradingWeightsVersion ?? 0,
  };
}

export async function resolveTaskGradingCategory(
  ctx: MutationCtx,
  requested: GradingCategory | null | undefined,
  gradable: boolean,
  task?: Doc<"courseTasks">,
) {
  if (requested && !gradable) throw new ConvexError("TASK_NOT_GRADABLE");
  const category = gradable
    ? requested === undefined
      ? task?.gradingCategory
      : (requested ?? undefined)
    : undefined;
  if (
    task?.gradingCategory !== undefined &&
    category !== task.gradingCategory &&
    (await ctx.db
      .query("courseTaskGrades")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", task._id))
      .first())
  )
    throw new ConvexError("TASK_GRADING_CATEGORY_LOCKED");
  return category;
}
