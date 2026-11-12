import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./functions";
import { getCurrentUserOrThrow } from "./users";
import { getCourseTaskAccess } from "./model/courseTaskAccess";
import {
  findTaskGrade,
  gradeEditorStateValidator,
  gradeViewValidator,
  gradingConfigurationValidator,
  projectGrade,
  projectGradeEditorState,
} from "./model/grading";
import {
  isValidPoints,
  sameGradingConfiguration,
  type GradingConfiguration,
} from "../lib/grading";

function isValidGrade(
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
    ) && (grade.comment === undefined || grade.comment.length <= 2_000)
  );
}

async function getTaskAccess(ctx: QueryCtx, taskId: Id<"courseTasks">) {
  const user = await getCurrentUserOrThrow(ctx);
  const task = await ctx.db.get("courseTasks", taskId);
  if (!task) throw new ConvexError("TASK_NOT_FOUND");
  const access = await getCourseTaskAccess(ctx, task, user._id);
  if (access.kind === "none") throw new ConvexError("PERMISSION_DENIED");
  return { user, task, access };
}

function requireGradableTask(
  task: Doc<"courseTasks">,
  access: Awaited<ReturnType<typeof getTaskAccess>>["access"],
) {
  if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
  if (!task.grading || task.releasedAt === undefined || task.isDraft)
    throw new ConvexError("TASK_NOT_GRADABLE");
  return task.grading;
}

async function getTarget(
  ctx: QueryCtx | MutationCtx,
  taskId: Id<"courseTasks">,
  requestedStudentId?: Id<"users">,
) {
  const { user, task, access } = await getTaskAccess(ctx, taskId);
  const studentId = requestedStudentId ?? user._id;
  if (access.kind === "student" && studentId !== user._id)
    throw new ConvexError("PERMISSION_DENIED");
  const recipient =
    access.kind === "student"
      ? access.recipient
      : await ctx.db
          .query("courseTaskRecipients")
          .withIndex("by_taskId_and_studentId", (q) =>
            q.eq("taskId", taskId).eq("studentId", studentId),
          )
          .unique();
  if (!recipient) throw new ConvexError("TASK_RECIPIENT_NOT_FOUND");
  const grade = await findTaskGrade(ctx, taskId, studentId);
  return { user, task, access, studentId, recipient, grade };
}

export const get = query({
  args: { taskId: v.id("courseTasks"), studentId: v.optional(v.id("users")) },
  returns: gradeEditorStateValidator,
  handler: async (ctx, { taskId, studentId }) => {
    const { task, access, recipient, grade } = await getTarget(
      ctx,
      taskId,
      studentId,
    );
    return projectGradeEditorState(
      task.grading,
      grade,
      recipient.submissionRevision,
      access.kind === "manager",
    );
  },
});

const writeArgs = {
  taskId: v.id("courseTasks"),
  studentId: v.id("users"),
  expectedVersion: v.number(),
  expectedSubmissionRevision: v.number(),
  operationId: v.string(),
  expectedGrading: gradingConfigurationValidator,
};

function validateWrite(args: {
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

export const saveDraft = mutation({
  args: {
    ...writeArgs,
    points: v.optional(v.number()),
    ...gradeViewValidator.pick("institutionalPoints", "comment").fields,
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    validateWrite(args);
    const { task, user, access, recipient, grade, studentId } = await getTarget(
      ctx,
      args.taskId,
      args.studentId,
    );
    const grading = requireGradableTask(task, access);
    if (!sameGradingConfiguration(grading, args.expectedGrading))
      throw new ConvexError("TASK_GRADING_CHANGED");
    if (
      (args.points === undefined) ===
      (args.institutionalPoints === undefined)
    )
      throw new ConvexError("INVALID_TASK_GRADE");

    const previous = grade?.draft ?? grade?.published;
    // A client can save only a comment with the exact points it received.
    // Keep the institutional score instead of treating its projection as new.
    const institutionalPoints =
      args.institutionalPoints ??
      (previous?.institutionalScale &&
      args.points === projectGrade(previous, grading).points
        ? previous.points
        : undefined);
    const points = institutionalPoints ?? args.points;
    const institutionalScale: true | undefined =
      institutionalPoints === undefined ? undefined : true;
    const comment = args.comment?.trim() || undefined;
    if (
      points === undefined ||
      !isValidGrade({ points, institutionalScale, comment }, grading)
    )
      throw new ConvexError("INVALID_TASK_GRADE");
    if (
      grade?.lastOperationId === args.operationId &&
      grade.lastOperationBy === user._id
    ) {
      if (
        grade.lastOperationKind !== "draft" ||
        grade.draft?.points !== points ||
        grade.draft.institutionalScale !== institutionalScale ||
        grade.draft.comment !== comment ||
        grade.draft.submissionRevision !== args.expectedSubmissionRevision
      )
        throw new ConvexError("INVALID_GRADE_REQUEST");
      return grade.version;
    }
    if ((grade?.version ?? 0) !== args.expectedVersion)
      throw new ConvexError("GRADE_CHANGED");
    if (recipient.submissionRevision !== args.expectedSubmissionRevision)
      throw new ConvexError("TASK_SUBMISSION_CHANGED");
    if (
      previous?.points === points &&
      previous.institutionalScale === institutionalScale &&
      previous.comment === comment &&
      previous.submissionRevision === recipient.submissionRevision
    )
      return grade!.version;
    const draft = {
      points,
      institutionalScale,
      comment,
      submissionRevision: recipient.submissionRevision,
      authorId: user._id,
      updatedAt: Date.now(),
    };
    const version = (grade?.version ?? 0) + 1;
    const changes = {
      draft,
      version,
      lastOperationId: args.operationId,
      lastOperationBy: user._id,
      lastOperationKind: "draft" as const,
    };
    if (grade) await ctx.db.patch("courseTaskGrades", grade._id, changes);
    else
      await ctx.db.insert("courseTaskGrades", {
        ...changes,
        taskId: task._id,
        classId: task.classId,
        studentId,
        recipientId: recipient._id,
      });
    return version;
  },
});

export const publish = mutation({
  args: writeArgs,
  returns: v.number(),
  handler: async (ctx, args) => {
    validateWrite(args);
    const { task, user, access, recipient, grade } = await getTarget(
      ctx,
      args.taskId,
      args.studentId,
    );
    const grading = requireGradableTask(task, access);
    if (!sameGradingConfiguration(grading, args.expectedGrading))
      throw new ConvexError("TASK_GRADING_CHANGED");
    if (
      grade?.lastOperationId === args.operationId &&
      grade.lastOperationBy === user._id
    ) {
      if (grade.lastOperationKind !== "publish")
        throw new ConvexError("INVALID_GRADE_REQUEST");
      return grade.version;
    }
    if ((grade?.version ?? 0) !== args.expectedVersion)
      throw new ConvexError("GRADE_CHANGED");
    if (!grade?.draft) throw new ConvexError("GRADE_DRAFT_REQUIRED");
    if (
      recipient.submissionRevision !== args.expectedSubmissionRevision ||
      grade.draft.submissionRevision !== recipient.submissionRevision
    )
      throw new ConvexError("TASK_SUBMISSION_CHANGED");
    if (!isValidGrade(grade.draft, grading))
      throw new ConvexError("INVALID_TASK_GRADE");
    return await publishDraft(
      ctx, grade, grade.draft, user._id, args.operationId,
    );
  },
});

async function publishDraft(
  ctx: MutationCtx,
  grade: Doc<"courseTaskGrades">,
  draft: NonNullable<Doc<"courseTaskGrades">["draft"]>,
  authorId: Id<"users">,
  operationId: string,
) {
  const version = grade.version + 1;
  const published = { ...draft, authorId, updatedAt: Date.now() };
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

function taskDrafts(ctx: QueryCtx, taskId: Id<"courseTasks">, before?: number) {
  return ctx.db
    .query("courseTaskGrades")
    .withIndex("by_taskId_and_draft_updatedAt", (q) => {
      const drafts = q.eq("taskId", taskId).gte("draft.updatedAt", 0);
      return before === undefined ? drafts : drafts.lte("draft.updatedAt", before);
    });
}

async function publishableDraft(
  ctx: QueryCtx,
  grade: Doc<"courseTaskGrades">,
  grading: GradingConfiguration,
) {
  if (!grade.draft || !isValidGrade(grade.draft, grading)) return undefined;
  const recipient = await ctx.db.get("courseTaskRecipients", grade.recipientId);
  return recipient?.taskId === grade.taskId &&
    recipient.studentId === grade.studentId &&
    recipient.submissionRevision === grade.draft.submissionRevision
    ? grade.draft
    : undefined;
}

export const hasPublishableDrafts = query({
  args: { taskId: v.id("courseTasks") },
  returns: v.boolean(),
  handler: async (ctx, { taskId }) => {
    const { task, access } = await getTaskAccess(ctx, taskId);
    const grading = requireGradableTask(task, access);
    for await (const grade of taskDrafts(ctx, taskId)) {
      if (await publishableDraft(ctx, grade, grading)) return true;
    }
    return false;
  },
});

const publicationCursor = v.object({ cursor: v.string(), before: v.number() });

export const publishAll = mutation({
  args: {
    taskId: v.id("courseTasks"),
    operationId: v.string(),
    continuation: v.optional(publicationCursor),
  },
  returns: v.object({
    published: v.number(),
    skipped: v.number(),
    continuation: v.union(publicationCursor, v.null()),
  }),
  handler: async (ctx, { taskId, operationId, continuation }) => {
    const { task, access, user } = await getTaskAccess(ctx, taskId);
    const grading = requireGradableTask(task, access);
    const now = Date.now();
    const before = continuation?.before ?? now;
    if (
      !operationId.trim() ||
      operationId.length > 100 ||
      !Number.isSafeInteger(before) ||
      before < 0 ||
      before > now
    )
      throw new ConvexError("INVALID_GRADE_REQUEST");

    const page = await taskDrafts(ctx, taskId, before).paginate({
      cursor: continuation?.cursor ?? null,
      numItems: 50,
    });
    const drafts = await Promise.all(
      page.page.map((grade) => publishableDraft(ctx, grade, grading)),
    );
    let published = 0;
    for (const [index, grade] of page.page.entries()) {
      const draft = drafts[index];
      if (!draft) continue;
      await publishDraft(ctx, grade, draft, user._id, operationId);
      published++;
    }
    return {
      published,
      skipped: page.page.length - published,
      continuation: page.isDone ? null : { cursor: page.continueCursor, before },
    };
  },
});

export const history = query({
  args: {
    taskId: v.id("courseTasks"),
    studentId: v.id("users"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    gradeViewValidator.extend({ version: v.number() }),
  ),
  handler: async (ctx, args) => {
    const { access, grade, task } = await getTarget(
      ctx,
      args.taskId,
      args.studentId,
    );
    const { grading } = task;
    if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
    if (!grade || !grading)
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("courseTaskGradeHistory")
      .withIndex("by_gradeId_and_version", (q) => q.eq("gradeId", grade._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map(
        ({
          version,
          points,
          institutionalScale,
          comment,
          submissionRevision,
          authorId,
          updatedAt,
        }) =>
          projectGrade(
            {
              version,
              points,
              institutionalScale,
              comment,
              submissionRevision,
              authorId,
              updatedAt,
            },
            grading,
          ),
      ),
    };
  },
});
