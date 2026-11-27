import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  DEFAULT_GRADING_POLICY,
  type GradingConfiguration,
  isValidPoints,
} from "../../lib/grading";
import { areQuizResultsAvailable } from "../../lib/course-quizzes";
import { courseQuizScoreValidator } from "./courseQuizValidators";

export const gradingPolicyValidator = v.object({
  scaleMax: v.number(),
  decimalPlaces: v.number(),
  defaultMaxPoints: v.number(),
  passingPercentage: v.optional(v.number()),
});

export const gradingConfigurationValidator = gradingPolicyValidator
  .omit("defaultMaxPoints")
  .extend({ maxPoints: v.number() });

export const taskGradeWriteArgs = {
  taskId: v.id("courseTasks"),
  studentId: v.id("users"),
  expectedVersion: v.number(),
  expectedSubmissionRevision: v.number(),
  operationId: v.string(),
  expectedGrading: gradingConfigurationValidator,
};

export function validateTaskGradeWrite(args: {
  expectedVersion: number;
  expectedSubmissionRevision: number;
  operationId: string;
}) {
  if (
    !Number.isSafeInteger(args.expectedVersion) ||
    args.expectedVersion < 0 ||
    !Number.isSafeInteger(args.expectedSubmissionRevision) ||
    args.expectedSubmissionRevision < 0 ||
    !args.operationId.trim() ||
    args.operationId.length > 100
  )
    throw new ConvexError("INVALID_GRADE_REQUEST");
}

const gradeResultFields = {
  points: v.number(),
  // Older results store points on the activity's scale.
  institutionalScale: v.optional(v.literal(true)),
  comment: v.optional(v.string()),
  submissionRevision: v.number(),
  updatedAt: v.number(),
};

export const manualGradeResultValidator = v.object({
  ...gradeResultFields,
  authorId: v.id("users"),
  source: v.optional(v.literal("manual")),
  quizScores: v.optional(v.array(courseQuizScoreValidator)),
});

const automaticGradeResultValidator = v.object({
  ...gradeResultFields,
  source: v.literal("automatic"),
  quizScores: v.array(courseQuizScoreValidator.extend({ points: v.number() })),
});

export const gradeResultValidator = v.union(
  manualGradeResultValidator,
  automaticGradeResultValidator,
);

const historyFields = {
  gradeId: v.id("courseTaskGrades"),
  version: v.number(),
};

export const gradeHistoryValidator = v.union(
  manualGradeResultValidator.extend(historyFields),
  automaticGradeResultValidator.extend(historyFields),
);

export const manualGradeViewValidator = manualGradeResultValidator
  .omit("institutionalScale", "quizScores")
  .extend({ institutionalPoints: v.optional(v.number()) });

const automaticGradeViewValidator = automaticGradeResultValidator
  .omit("institutionalScale", "quizScores")
  .extend({ institutionalPoints: v.optional(v.number()) });

export const gradeViewValidator = v.union(
  manualGradeViewValidator,
  automaticGradeViewValidator,
);

export const gradeHistoryViewValidator = v.union(
  manualGradeViewValidator.extend({ version: v.number() }),
  automaticGradeViewValidator.extend({ version: v.number() }),
);

export function isValidTaskGrade(
  grade: Pick<
    NonNullable<Doc<"courseTaskGrades">["draft"]>,
    "points" | "institutionalScale" | "comment"
  >,
  grading: GradingConfiguration,
) {
  return (
    isValidPoints(
      grade.points,
      grade.institutionalScale ? grading.scaleMax : grading.maxPoints,
      grading.decimalPlaces,
    ) &&
    (grade.comment === undefined || grade.comment.length <= 2_000)
  );
}

export async function publishTaskGrade(
  ctx: MutationCtx,
  grade: Doc<"courseTaskGrades">,
  result: Infer<typeof gradeResultValidator>,
  authorId: Id<"users"> | null,
  operationId: string,
) {
  const version = grade.version + 1;
  let published: Infer<typeof gradeResultValidator>;
  if (result.source === "automatic") {
    if (authorId !== null) throw new ConvexError("INVALID_GRADE_REQUEST");
    published = { ...result, updatedAt: Date.now() };
  } else {
    if (authorId === null) throw new ConvexError("INVALID_GRADE_REQUEST");
    published = { ...result, authorId, updatedAt: Date.now() };
  }
  await ctx.db.patch("courseTaskGrades", grade._id, {
    published,
    draft: undefined,
    version,
    lastOperationId: operationId,
    lastOperationBy: authorId,
    lastOperationKind: "publish",
  });
  await ctx.db.insert("courseTaskGradeHistory", {
    gradeId: grade._id,
    version,
    ...published,
  });
  return version;
}

export async function saveTaskGradeDraft(
  ctx: MutationCtx,
  {
    task,
    recipient,
    grade,
    draft,
    operationId,
  }: {
    task: Doc<"courseTasks">;
    recipient: Doc<"courseTaskRecipients">;
    grade: Doc<"courseTaskGrades"> | null;
    draft: Infer<typeof manualGradeResultValidator>;
    operationId: string;
  },
) {
  const version = (grade?.version ?? 0) + 1;
  const changes = {
    draft,
    version,
    lastOperationId: operationId,
    lastOperationBy: draft.authorId,
    lastOperationKind: "draft" as const,
  };
  if (grade) await ctx.db.patch("courseTaskGrades", grade._id, changes);
  else
    await ctx.db.insert("courseTaskGrades", {
      ...changes,
      taskId: task._id,
      classId: task.classId,
      studentId: recipient.studentId,
      recipientId: recipient._id,
    });
  return version;
}

export function projectGrade(
  result: Infer<typeof gradeResultValidator>,
  { scaleMax, maxPoints }: GradingConfiguration,
): Infer<typeof gradeViewValidator> {
  const { institutionalScale, points, comment, submissionRevision, updatedAt } =
    result;
  const view = {
    // Keep the old API in activity units without rounding away the new score.
    points: institutionalScale ? (points * maxPoints) / scaleMax : points,
    institutionalPoints: institutionalScale ? points : undefined,
    comment,
    submissionRevision,
    updatedAt,
  };
  if (result.source === "automatic") return { ...view, source: "automatic" };
  return {
    ...view,
    authorId: result.authorId,
    ...(result.source === undefined ? {} : { source: result.source }),
  };
}

export const gradeEditorStateValidator = v.object({
  grading: v.union(gradingConfigurationValidator, v.null()),
  version: v.number(),
  draft: v.union(gradeViewValidator, v.null()),
  published: v.union(gradeViewValidator, v.null()),
  needsReview: v.boolean(),
  availableAt: v.optional(v.number()),
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
  task: Pick<Doc<"courseTasks">, "kind" | "quiz" | "dueAt" | "grading">,
  grade: Doc<"courseTaskGrades"> | null,
  submissionRevision: number,
  canManage: boolean,
) {
  const { grading } = task;
  const scheduled = task.kind === "quiz" && !areQuizResultsAvailable(task);
  const visibleGrade = canManage || !scheduled ? grade : null;
  return {
    grading: grading ?? null,
    version: canManage ? (grade?.version ?? 0) : 0,
    draft:
      canManage && grade?.draft && grading
        ? projectGrade(grade.draft, grading)
        : null,
    published:
      visibleGrade?.published && grading
        ? {
            ...projectGrade(visibleGrade.published, grading),
            updatedAt:
              !canManage && task.kind === "quiz"
                ? Math.max(
                    visibleGrade.published.updatedAt,
                    task.quiz?.closedAt ?? 0,
                  )
                : visibleGrade.published.updatedAt,
          }
        : null,
    needsReview:
      visibleGrade?.published !== undefined &&
      visibleGrade.published.submissionRevision !== submissionRevision,
    ...(scheduled ? { availableAt: task.dueAt } : {}),
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
