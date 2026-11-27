import { ConvexError, v } from "convex/values";
import { doc } from "convex-helpers/validators";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import schema from "./schema";
import { query, type QueryCtx } from "./_generated/server";
import { mutation, internalMutation } from "./functions";
import { getCurrentUserOrThrow } from "./users";
import { areQuizResultsAvailable } from "../lib/course-quizzes";
import { isValidPoints, sameGradingConfiguration } from "../lib/grading";
import {
  canSubmitCourseTask,
  getCourseTaskAccess,
  requireOpenCourse,
  requireTaskManager,
} from "./model/courseTaskAccess";
import { validateTaskDates } from "./model/courseTaskDates";
import {
  releaseCourseTask,
  scheduleTaskRelease,
} from "./model/courseTaskPublication";
import {
  findTaskGrade,
  getCourseGradingPolicy,
  gradingConfigurationValidator,
  resolveTaskGrading,
  publishTaskGrade,
  saveTaskGradeDraft,
  taskGradeWriteArgs,
  validateTaskGradeWrite,
} from "./model/grading";
import {
  courseQuizAnswerUpdateValidator,
  courseQuizAnswerViewValidator,
  courseQuizQuestionInputValidator,
  courseQuizQuestionViewValidator,
  courseQuizScoreValidator,
} from "./model/courseQuizValidators";
import {
  finalizeQuiz,
  isValidQuizGrade,
  canEditQuizQuestions,
  QUIZ_RECIPIENT_BATCH_SIZE,
  listQuizAnswers,
  listQuizQuestions,
  orderQuizQuestions,
  quizEndsAt,
  quizQuestionView,
  requireQuiz,
  scheduleQuizClose,
  shuffleQuizQuestions,
  scoreQuizAnswers,
  sumQuizPoints,
  validateQuizDuration,
  validateQuizQuestions,
  writeQuizAnswers,
  writeQuizQuestions,
} from "./model/courseQuizzes";

async function getAccess(ctx: QueryCtx, taskId: Id<"courseTasks">) {
  const user = await getCurrentUserOrThrow(ctx);
  const task = await ctx.db.get("courseTasks", taskId);
  requireQuiz(task);
  const access = await getCourseTaskAccess(ctx, task, user._id);
  if (access.kind === "none") throw new ConvexError("PERMISSION_DENIED");
  return { user, task, access };
}

const timingValidator = v.object({
  startedAt: v.number(),
  timeLimitAt: v.number(),
  endsAt: v.number(),
  submittedAt: v.optional(v.number()),
});

export const create = mutation({
  args: {
    classId: v.id("classes"),
    title: v.string(),
    description: v.optional(v.string()),
    availableAt: v.optional(v.number()),
    dueAt: v.number(),
    durationMinutes: v.number(),
    shuffleQuestions: v.optional(v.boolean()),
    questions: v.array(courseQuizQuestionInputValidator),
  },
  returns: v.id("courseTasks"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await requireTaskManager(ctx, args.classId, user._id);
    const now = Date.now();
    const courseEndAt = await requireOpenCourse(ctx, course, now);
    validateQuizDuration(args.durationMinutes);
    validateTaskDates({
      availableAt: args.availableAt,
      dueAt: args.dueAt,
      now,
      courseEndAt,
      requireFutureDue: true,
    });
    const title = args.title.trim();
    const description = args.description?.trim() || undefined;
    if (!title || title.length > 160)
      throw new ConvexError("INVALID_QUIZ_TITLE");
    if (description && description.length > 10_000)
      throw new ConvexError("TASK_DESCRIPTION_TOO_LONG");
    const policy = await getCourseGradingPolicy(ctx, course);
    const maxPoints = validateQuizQuestions(
      args.questions,
      policy.decimalPlaces,
    );
    const grading = await resolveTaskGrading(ctx, course, { maxPoints });
    const taskId = await ctx.db.insert("courseTasks", {
      classId: course._id,
      createdBy: user._id,
      kind: "quiz",
      quiz: {
        durationMinutes: args.durationMinutes,
        questionCount: args.questions.length,
        shuffleQuestions: args.shuffleQuestions,
      },
      title,
      description,
      grading,
      availableAt: args.availableAt,
      dueAt: args.dueAt,
      availabilitySortAt: args.availableAt,
      allowLateSubmissions: false,
      updatedAt: now,
    });
    await writeQuizQuestions(ctx, taskId, args.questions);
    const task = await ctx.db.get("courseTasks", taskId);
    requireQuiz(task);
    await scheduleQuizClose(ctx, task);
    if (args.availableAt !== undefined && args.availableAt > now) {
      await scheduleTaskRelease(ctx, taskId, args.availableAt);
    } else if (!(await releaseCourseTask(ctx, task, course, now))) {
      throw new ConvexError("TASK_RELEASE_FAILED");
    }
    return taskId;
  },
});

const attemptReadArgs = { taskId: v.id("courseTasks"), now: v.number() };

export const getForEditing = query({
  args: { taskId: v.id("courseTasks") },
  returns: v.object({
    task: doc(schema, "courseTasks"),
    questions: v.union(v.array(doc(schema, "courseQuizQuestions")), v.null()),
  }),
  handler: async (ctx, { taskId }) => {
    const { task, access } = await getAccess(ctx, taskId);
    if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
    const editable = canEditQuizQuestions(task);
    const questions =
      editable || task.quiz.questionCount === undefined
        ? await listQuizQuestions(ctx, taskId)
        : null;
    return {
      task: {
        ...task,
        quiz: {
          ...task.quiz,
          questionCount: task.quiz.questionCount ?? questions!.length,
        },
      },
      questions: editable ? questions : null,
    };
  },
});
const attemptViewValidator = v.object({
  durationMinutes: v.number(),
  dueAt: v.number(),
  canManage: v.boolean(),
  canStart: v.boolean(),
  canAnswer: v.boolean(),
  attempt: v.union(timingValidator, v.null()),
  answers: v.array(courseQuizAnswerViewValidator),
});
type QuizAccess = Awaited<ReturnType<typeof getAccess>>;

async function readQuestions(ctx: QueryCtx, { task, access }: QuizAccess) {
  const questions =
    access.kind === "manager" || access.recipient.quizAttempt
      ? await listQuizQuestions(ctx, task._id)
      : [];
  const ordered =
    access.kind === "student"
      ? orderQuizQuestions(
          questions,
          access.recipient.quizAttempt?.questionOrder,
        )
      : questions;
  return ordered.map((question) =>
    quizQuestionView(question, access.kind === "manager"),
  );
}

async function readAttempt(
  ctx: QueryCtx,
  { task, access }: QuizAccess,
  now: number,
) {
  if (!Number.isFinite(now)) throw new ConvexError("INVALID_QUIZ_TIME");
  const recipient = access.kind === "student" ? access.recipient : null;
  const attempt = recipient?.quizAttempt;
  const open = await canSubmitCourseTask(ctx, access.course, task, now);
  const answers =
    recipient && attempt
      ? await listQuizAnswers(ctx, task._id, recipient._id)
      : [];
  return {
    durationMinutes: task.quiz.durationMinutes,
    dueAt: task.dueAt,
    canManage: access.kind === "manager",
    canStart: access.kind === "student" && !attempt && open,
    canAnswer:
      !!recipient &&
      !!attempt &&
      recipient.submittedAt === undefined &&
      open &&
      now < quizEndsAt(task, recipient),
    attempt:
      recipient && attempt
        ? {
            startedAt: attempt.startedAt,
            timeLimitAt: attempt.timeLimitAt,
            endsAt: quizEndsAt(task, recipient),
            submittedAt: recipient.submittedAt,
          }
        : null,
    answers: answers.map(({ questionId, answer, version }) => ({
      questionId,
      answer,
      version,
    })),
  };
}

export const get = query({
  args: attemptReadArgs,
  returns: attemptViewValidator.extend({
    questions: v.array(courseQuizQuestionViewValidator),
  }),
  handler: async (ctx, { taskId, now }) => {
    const access = await getAccess(ctx, taskId);
    const [attempt, questions] = await Promise.all([
      readAttempt(ctx, access, now),
      readQuestions(ctx, access),
    ]);
    return { ...attempt, questions };
  },
});

export const getQuestions = query({
  args: { taskId: v.id("courseTasks") },
  returns: v.array(courseQuizQuestionViewValidator),
  handler: async (ctx, { taskId }) =>
    await readQuestions(ctx, await getAccess(ctx, taskId)),
});

export const getAttempt = query({
  args: attemptReadArgs,
  returns: attemptViewValidator,
  handler: async (ctx, { taskId, now }) =>
    await readAttempt(ctx, await getAccess(ctx, taskId), now),
});

export const start = mutation({
  args: { taskId: v.id("courseTasks") },
  returns: timingValidator.extend({ serverNow: v.number() }),
  handler: async (ctx, { taskId }) => {
    const { task, access } = await getAccess(ctx, taskId);
    if (access.kind !== "student") throw new ConvexError("PERMISSION_DENIED");
    const recipient = access.recipient;
    const now = Date.now();
    if (recipient.quizAttempt) {
      let submittedAt = recipient.submittedAt;
      if (submittedAt === undefined && now >= quizEndsAt(task, recipient)) {
        submittedAt = await finalizeQuiz(ctx, {
          task,
          recipient,
          questions: await listQuizQuestions(ctx, taskId),
          now,
          manual: false,
        });
      }
      return {
        startedAt: recipient.quizAttempt.startedAt,
        timeLimitAt: recipient.quizAttempt.timeLimitAt,
        endsAt: quizEndsAt(task, recipient),
        submittedAt,
        serverNow: now,
      };
    }
    if (!(await canSubmitCourseTask(ctx, access.course, task, now)))
      throw new ConvexError("TASK_SUBMISSION_CLOSED");
    const questionOrder = task.quiz.shuffleQuestions
      ? shuffleQuizQuestions(await listQuizQuestions(ctx, taskId))
      : undefined;
    const timeLimitAt = now + task.quiz.durationMinutes * 60_000;
    const endsAt = Math.min(timeLimitAt, task.dueAt);
    const expirationScheduledId = await ctx.scheduler.runAt(
      endsAt,
      internal.courseQuizzes.expire,
      { recipientId: recipient._id },
    );
    await ctx.db.patch("courseTaskRecipients", recipient._id, {
      quizAttempt: {
        startedAt: now,
        timeLimitAt,
        expirationScheduledId,
        questionOrder,
      },
    });
    if (task.quiz.firstStartedAt === undefined) {
      await ctx.db.patch("courseTasks", taskId, {
        quiz: { ...task.quiz, firstStartedAt: now },
      });
    }
    return { startedAt: now, timeLimitAt, endsAt, serverNow: now };
  },
});

export const saveAnswers = mutation({
  args: {
    taskId: v.id("courseTasks"),
    answers: v.array(courseQuizAnswerUpdateValidator),
  },
  returns: v.array(
    v.object({ questionId: v.id("courseQuizQuestions"), version: v.number() }),
  ),
  handler: async (ctx, { taskId, answers }) => {
    const { task, access } = await getAccess(ctx, taskId);
    if (access.kind !== "student") throw new ConvexError("PERMISSION_DENIED");
    const recipient = access.recipient;
    const now = Date.now();
    if (recipient.submittedAt !== undefined)
      throw new ConvexError("QUIZ_ALREADY_SUBMITTED");
    if (
      now >= quizEndsAt(task, recipient) ||
      !(await canSubmitCourseTask(ctx, access.course, task, now))
    )
      throw new ConvexError("QUIZ_TIME_EXPIRED");
    return await writeQuizAnswers(ctx, task, recipient, answers, now);
  },
});

export const submit = mutation({
  args: {
    taskId: v.id("courseTasks"),
    answers: v.optional(v.array(courseQuizAnswerUpdateValidator)),
  },
  returns: v.object({ submittedAt: v.number() }),
  handler: async (ctx, { taskId, answers }) => {
    const { task, access } = await getAccess(ctx, taskId);
    if (access.kind !== "student") throw new ConvexError("PERMISSION_DENIED");
    const recipient = access.recipient;
    if (recipient.submittedAt !== undefined)
      return { submittedAt: recipient.submittedAt };
    const now = Date.now();
    const expired = now >= quizEndsAt(task, recipient);
    const questions = await listQuizQuestions(ctx, taskId);
    if (!expired) {
      if (!(await canSubmitCourseTask(ctx, access.course, task, now)))
        throw new ConvexError("TASK_SUBMISSION_CLOSED");
      await writeQuizAnswers(ctx, task, recipient, answers ?? [], now);
    }
    const submittedAt = await finalizeQuiz(ctx, {
      task,
      recipient,
      questions,
      now,
      manual: !expired,
    });
    return { submittedAt };
  },
});

export const expire = internalMutation({
  args: { recipientId: v.id("courseTaskRecipients") },
  returns: v.null(),
  handler: async (ctx, { recipientId }) => {
    const recipient = await ctx.db.get("courseTaskRecipients", recipientId);
    if (!recipient?.quizAttempt || recipient.submittedAt !== undefined)
      return null;
    const task = await ctx.db.get("courseTasks", recipient.taskId);
    if (!task || !(await ctx.db.get("classes", task.classId))) return null;
    requireQuiz(task);
    const now = Date.now();
    const deadline = quizEndsAt(task, recipient);
    if (now < deadline) {
      const expirationScheduledId = await ctx.scheduler.runAt(
        deadline,
        internal.courseQuizzes.expire,
        { recipientId },
      );
      await ctx.db.patch("courseTaskRecipients", recipientId, {
        quizAttempt: { ...recipient.quizAttempt, expirationScheduledId },
      });
      return null;
    }
    await finalizeQuiz(ctx, {
      task,
      recipient,
      questions: await listQuizQuestions(ctx, task._id),
      now,
      manual: false,
    });
    return null;
  },
});

export const close = internalMutation({
  args: { taskId: v.id("courseTasks"), expectedDueAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { taskId, expectedDueAt }) => {
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task || task.dueAt !== expectedDueAt || Date.now() < expectedDueAt)
      return null;
    requireQuiz(task);
    if (task.quiz.closedAt === expectedDueAt) return null;
    await ctx.db.patch("courseTasks", taskId, {
      quiz: { ...task.quiz, closedAt: expectedDueAt },
    });
    await ctx.scheduler.runAfter(0, internal.courseQuizzes.closeBatch, {
      taskId,
      expectedDueAt,
      cursor: null,
    });
    return null;
  },
});

export const closeBatch = internalMutation({
  args: {
    taskId: v.id("courseTasks"),
    expectedDueAt: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { taskId, expectedDueAt, cursor }) => {
    const task = await ctx.db.get("courseTasks", taskId);
    if (
      !task ||
      task.dueAt !== expectedDueAt ||
      Date.now() < expectedDueAt ||
      !(await ctx.db.get("classes", task.classId))
    )
      return null;
    requireQuiz(task);
    const questions = await listQuizQuestions(ctx, taskId);
    const page = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_submittedAt", (q) =>
        q.eq("taskId", taskId).eq("submittedAt", undefined),
      )
      .paginate({ cursor, numItems: QUIZ_RECIPIENT_BATCH_SIZE });
    for (const recipient of page.page) {
      if (recipient.quizAttempt && recipient.submittedAt === undefined) {
        await finalizeQuiz(ctx, {
          task,
          recipient,
          questions,
          now: Date.now(),
          manual: false,
        });
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.courseQuizzes.closeBatch, {
        taskId,
        expectedDueAt,
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const getReview = query({
  args: { taskId: v.id("courseTasks"), studentId: v.optional(v.id("users")) },
  returns: v.object({
    questions: v.array(courseQuizQuestionViewValidator),
    answers: v.array(courseQuizAnswerViewValidator),
    scores: v.array(courseQuizScoreValidator),
    version: v.number(),
    submissionRevision: v.number(),
    grading: gradingConfigurationValidator,
    comment: v.optional(v.string()),
  }),
  handler: async (ctx, { taskId, studentId }) => {
    const { task, access, user } = await getAccess(ctx, taskId);
    const targetId = studentId ?? user._id;
    if (access.kind === "student" && targetId !== user._id)
      throw new ConvexError("PERMISSION_DENIED");
    const recipient =
      access.kind === "student"
        ? access.recipient
        : await ctx.db
            .query("courseTaskRecipients")
            .withIndex("by_taskId_and_studentId", (q) =>
              q.eq("taskId", taskId).eq("studentId", targetId),
            )
            .unique();
    if (!recipient?.quizAttempt) throw new ConvexError("QUIZ_NOT_STARTED");
    // A scheduled database marker unlocks every student's reactive view together.
    if (access.kind === "student" && !areQuizResultsAvailable(task))
      throw new ConvexError("QUIZ_REVIEW_LOCKED");
    const questions = await listQuizQuestions(ctx, taskId);
    const answers = await listQuizAnswers(ctx, taskId, recipient._id);
    const grade = await findTaskGrade(ctx, taskId, targetId);
    const result =
      access.kind === "manager"
        ? (grade?.draft ?? grade?.published)
        : grade?.published;
    const scores =
      result?.quizScores ??
      (access.kind === "manager"
        ? scoreQuizAnswers(questions, answers)
        : questions.map((question) => ({
            questionId: question._id,
            points: null,
          })));
    return {
      questions: orderQuizQuestions(
        questions,
        recipient.quizAttempt.questionOrder,
      ).map((question) => quizQuestionView(question, true)),
      answers: answers.map(({ questionId, answer, version }) => ({
        questionId,
        answer,
        version,
      })),
      scores,
      version: access.kind === "manager" ? (grade?.version ?? 0) : 0,
      submissionRevision: recipient.submissionRevision,
      grading: task.grading,
      comment: result?.comment,
    };
  },
});

export const saveReview = mutation({
  args: {
    ...taskGradeWriteArgs,
    scores: v.array(courseQuizScoreValidator),
    comment: v.optional(v.string()),
    publish: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    validateTaskGradeWrite(args);
    const { task, access, user } = await getAccess(ctx, args.taskId);
    if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
    if (!sameGradingConfiguration(task.grading, args.expectedGrading))
      throw new ConvexError("TASK_GRADING_CHANGED");
    const recipient = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", task._id).eq("studentId", args.studentId),
      )
      .unique();
    if (!recipient || recipient.submittedAt === undefined)
      throw new ConvexError("QUIZ_NOT_SUBMITTED");
    if (recipient.submissionRevision !== args.expectedSubmissionRevision)
      throw new ConvexError("TASK_SUBMISSION_CHANGED");
    const questions = await listQuizQuestions(ctx, task._id);
    if (
      args.scores.length > questions.length ||
      new Set(args.scores.map((score) => score.questionId)).size !==
        args.scores.length
    )
      throw new ConvexError("INVALID_QUIZ_SCORES");
    for (const score of args.scores) {
      const question = questions.find(
        (question) => question._id === score.questionId,
      );
      if (
        !question ||
        question.kind !== "text" ||
        (score.points !== null &&
          !isValidPoints(
            score.points,
            question.maxPoints,
            task.grading.decimalPlaces,
          ))
      )
        throw new ConvexError("INVALID_QUIZ_SCORES");
    }
    const comment = args.comment?.trim() || undefined;
    if (comment && comment.length > 2_000)
      throw new ConvexError("INVALID_TASK_GRADE");
    const quizScores = scoreQuizAnswers(
      questions,
      await listQuizAnswers(ctx, task._id, recipient._id),
      args.scores,
    );
    const draft = {
      source: "manual" as const,
      points: sumQuizPoints(
        quizScores.map((score) => score.points ?? 0),
        task.grading.decimalPlaces,
      ),
      quizScores,
      submissionRevision: recipient.submissionRevision,
      authorId: user._id,
      updatedAt: Date.now(),
      comment,
    };
    const grade = await findTaskGrade(ctx, task._id, args.studentId);
    if (
      grade?.lastOperationId === args.operationId &&
      grade.lastOperationBy === user._id
    ) {
      const previous = args.publish ? grade.published : grade.draft;
      if (
        grade.lastOperationKind !== (args.publish ? "publish" : "draft") ||
        !previous ||
        previous.comment !== comment ||
        !previous.quizScores ||
        previous.quizScores.length !== quizScores.length ||
        !previous.quizScores.every(
          (score, index) =>
            score.questionId === quizScores[index].questionId &&
            score.points === quizScores[index].points,
        )
      )
        throw new ConvexError("INVALID_GRADE_REQUEST");
      return grade.version;
    }
    if ((grade?.version ?? 0) !== args.expectedVersion)
      throw new ConvexError("GRADE_CHANGED");
    if (
      args.publish &&
      !(await isValidQuizGrade(ctx, task, recipient, draft, questions))
    )
      throw new ConvexError("QUIZ_REVIEW_INCOMPLETE");
    const version = await saveTaskGradeDraft(ctx, {
      task,
      recipient,
      grade,
      draft,
      operationId: args.operationId,
    });
    if (!args.publish) return version;
    const savedGrade = (await findTaskGrade(ctx, task._id, args.studentId))!;
    return await publishTaskGrade(
      ctx,
      savedGrade,
      draft,
      user._id,
      args.operationId,
    );
  },
});
