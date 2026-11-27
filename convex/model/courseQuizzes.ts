import { compareValues, ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { isValidPoints } from "../../lib/grading";
import {
  findTaskGrade,
  publishTaskGrade,
  type gradeResultValidator,
} from "./grading";
import type {
  courseQuizAnswerUpdateValidator,
  courseQuizQuestionEditValidator,
  courseQuizQuestionInputValidator,
  courseQuizScoreValidator,
} from "./courseQuizValidators";

import {
  MAX_QUIZ_QUESTIONS,
  MAX_QUIZ_TEXT_LENGTH,
  areQuizQuestionsValid,
  isAutomaticQuizQuestion,
  isValidQuizDuration,
  sumQuizPoints,
  sameQuizAnswer,
  sameQuizOptionIds,
} from "../../lib/course-quizzes";
export { sumQuizPoints } from "../../lib/course-quizzes";
// Leave read headroom when every student has 50 long text answers.
export const QUIZ_RECIPIENT_BATCH_SIZE = 5;

export type QuizTask = Doc<"courseTasks"> & {
  kind: "quiz";
  quiz: NonNullable<Doc<"courseTasks">["quiz"]>;
  grading: NonNullable<Doc<"courseTasks">["grading"]>;
  dueAt: number;
};

export function requireQuiz(
  task: Doc<"courseTasks"> | null,
): asserts task is QuizTask {
  if (
    !task ||
    task.kind !== "quiz" ||
    !task.quiz ||
    !task.grading ||
    task.dueAt === undefined ||
    task.isDraft
  )
    throw new ConvexError("QUIZ_NOT_FOUND");
}

export function validateQuizDuration(minutes: number) {
  if (!isValidQuizDuration(minutes))
    throw new ConvexError("INVALID_QUIZ_DURATION");
}

export function validateQuizQuestions(
  questions: Infer<typeof courseQuizQuestionInputValidator>[],
  decimalPlaces: number,
) {
  if (!areQuizQuestionsValid(questions, decimalPlaces))
    throw new ConvexError("INVALID_QUIZ_QUESTIONS");
  return sumQuizPoints(
    questions.map((question) => question.maxPoints),
    decimalPlaces,
  );
}

export async function listQuizQuestions(
  ctx: QueryCtx,
  taskId: Id<"courseTasks">,
) {
  const questions = await ctx.db
    .query("courseQuizQuestions")
    .withIndex("by_taskId_and_order", (q) => q.eq("taskId", taskId))
    .take(MAX_QUIZ_QUESTIONS + 1);
  if (!questions.length || questions.length > MAX_QUIZ_QUESTIONS)
    throw new ConvexError("INVALID_QUIZ_QUESTIONS");
  return questions;
}

export function canEditQuizQuestions(task: QuizTask) {
  return (
    task.releasedAt === undefined &&
    task.quiz.firstStartedAt === undefined &&
    task.quiz.closedAt === undefined
  );
}

export async function writeQuizQuestions(
  ctx: MutationCtx,
  taskId: Id<"courseTasks">,
  questions: Infer<typeof courseQuizQuestionEditValidator>[],
  existing: Doc<"courseQuizQuestions">[] = [],
) {
  const existingById = new Map(
    existing.map((question) => [question._id, question]),
  );
  const retained = new Set<Id<"courseQuizQuestions">>();
  for (const question of questions) {
    if (question._id !== undefined) {
      if (!existingById.has(question._id) || retained.has(question._id))
        throw new ConvexError("INVALID_QUIZ_QUESTIONS");
      retained.add(question._id);
    }
  }
  for (const [order, { _id, ...question }] of questions.entries()) {
    const value = {
      ...question,
      prompt: question.prompt.trim(),
      taskId,
      order,
    };
    if (_id) {
      const previous = existingById.get(_id)!;
      const next = { ...value, _id, _creationTime: previous._creationTime };
      if (
        compareValues(
          quizQuestionView(previous, true),
          quizQuestionView(next, true),
        ) !== 0
      )
        await ctx.db.replace("courseQuizQuestions", _id, value);
    } else await ctx.db.insert("courseQuizQuestions", value);
  }
  for (const question of existing) {
    if (!retained.has(question._id))
      await ctx.db.delete("courseQuizQuestions", question._id);
  }
}

export async function updateQuizQuestions(
  ctx: MutationCtx,
  task: QuizTask,
  questions: Infer<typeof courseQuizQuestionEditValidator>[],
) {
  if (!canEditQuizQuestions(task))
    throw new ConvexError("QUIZ_QUESTIONS_LOCKED");
  const maxPoints = validateQuizQuestions(
    questions,
    task.grading.decimalPlaces,
  );
  const existing = await listQuizQuestions(ctx, task._id);
  await writeQuizQuestions(ctx, task._id, questions, existing);
  return { ...task.grading, maxPoints };
}

export function shuffleQuizQuestions(questions: Doc<"courseQuizQuestions">[]) {
  const ids = questions.map((question) => question._id);
  for (let index = ids.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  return ids;
}

export function orderQuizQuestions(
  questions: Doc<"courseQuizQuestions">[],
  questionOrder: Id<"courseQuizQuestions">[] | undefined,
) {
  if (questionOrder === undefined) return questions;
  if (
    questionOrder.length !== questions.length ||
    new Set(questionOrder).size !== questions.length
  )
    throw new ConvexError("INVALID_QUIZ_QUESTION_ORDER");
  const byId = new Map(questions.map((question) => [question._id, question]));
  return questionOrder.map((id) => {
    const question = byId.get(id);
    if (!question) throw new ConvexError("INVALID_QUIZ_QUESTION_ORDER");
    return question;
  });
}

export async function listQuizAnswers(
  ctx: QueryCtx,
  taskId: Id<"courseTasks">,
  recipientId: Id<"courseTaskRecipients">,
) {
  const answers = await ctx.db
    .query("courseQuizAnswers")
    .withIndex("by_taskId_and_recipientId_and_questionId", (q) =>
      q.eq("taskId", taskId).eq("recipientId", recipientId),
    )
    .take(MAX_QUIZ_QUESTIONS + 1);
  if (
    answers.length > MAX_QUIZ_QUESTIONS ||
    new Set(answers.map((answer) => answer.questionId)).size !== answers.length
  )
    throw new ConvexError("INVALID_QUIZ_ANSWERS");
  return answers;
}

export function quizEndsAt(
  task: QuizTask,
  recipient: Doc<"courseTaskRecipients">,
) {
  if (!recipient.quizAttempt) throw new ConvexError("QUIZ_NOT_STARTED");
  return Math.min(recipient.quizAttempt.timeLimitAt, task.dueAt);
}

export function quizQuestionView(
  question: Doc<"courseQuizQuestions">,
  revealKey: boolean,
) {
  const common = {
    _id: question._id,
    order: question.order,
    prompt: question.prompt,
    maxPoints: question.maxPoints,
  };
  if (question.kind === "text") return { ...common, kind: question.kind };
  if (question.kind === "single_choice")
    return {
      ...common,
      kind: question.kind,
      options: question.options,
      ...(revealKey ? { correctOptionId: question.correctOptionId } : {}),
    };
  return {
    ...common,
    kind: question.kind,
    options: question.options,
    ...(revealKey ? { correctOptionIds: question.correctOptionIds } : {}),
  };
}

export async function cancelQuizClose(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
) {
  if (task.quiz?.closeScheduledId) {
    const scheduled = await ctx.db.system.get(
      "_scheduled_functions",
      task.quiz.closeScheduledId,
    );
    if (scheduled?.state.kind === "pending")
      await ctx.scheduler.cancel(task.quiz.closeScheduledId);
  }
}

export async function scheduleQuizClose(ctx: MutationCtx, task: QuizTask) {
  await cancelQuizClose(ctx, task);
  const closeScheduledId = await ctx.scheduler.runAt(
    task.dueAt,
    internal.courseQuizzes.close,
    {
      taskId: task._id,
      expectedDueAt: task.dueAt,
    },
  );
  await ctx.db.patch("courseTasks", task._id, {
    quiz: { ...task.quiz, closeScheduledId },
  });
}

export async function writeQuizAnswers(
  ctx: MutationCtx,
  task: QuizTask,
  recipient: Doc<"courseTaskRecipients">,
  updates: Infer<typeof courseQuizAnswerUpdateValidator>[],
  now: number,
) {
  if (
    updates.length > MAX_QUIZ_QUESTIONS ||
    new Set(updates.map((update) => update.questionId)).size !== updates.length
  )
    throw new ConvexError("INVALID_QUIZ_ANSWERS");
  const versions = [];
  for (const update of updates) {
    const question = await ctx.db.get("courseQuizQuestions", update.questionId);
    if (
      !question ||
      question.taskId !== task._id ||
      question.kind !== update.answer.kind ||
      !Number.isSafeInteger(update.expectedVersion) ||
      update.expectedVersion < 0 ||
      update.expectedVersion >= Number.MAX_SAFE_INTEGER
    )
      throw new ConvexError("INVALID_QUIZ_ANSWERS");
    const answer = update.answer;
    if (
      (answer.kind === "text" && answer.text.length > MAX_QUIZ_TEXT_LENGTH) ||
      (answer.kind === "single_choice" &&
        answer.optionId !== null &&
        (question.kind !== "single_choice" ||
          !question.options.some((option) => option.id === answer.optionId))) ||
      (answer.kind === "multiple_choice" &&
        (question.kind !== "multiple_choice" ||
          answer.optionIds.length > question.options.length ||
          new Set(answer.optionIds).size !== answer.optionIds.length ||
          answer.optionIds.some(
            (id) => !question.options.some((option) => option.id === id),
          )))
    )
      throw new ConvexError("INVALID_QUIZ_ANSWERS");
    const previous = await ctx.db
      .query("courseQuizAnswers")
      .withIndex("by_taskId_and_recipientId_and_questionId", (q) =>
        q
          .eq("taskId", task._id)
          .eq("recipientId", recipient._id)
          .eq("questionId", question._id),
      )
      .unique();
    if (
      previous &&
      previous.version === update.expectedVersion + 1 &&
      sameQuizAnswer(previous.answer, answer)
    ) {
      versions.push({ questionId: question._id, version: previous.version });
      continue;
    }
    if ((previous?.version ?? 0) !== update.expectedVersion)
      throw new ConvexError("QUIZ_ANSWER_CHANGED");
    const version = update.expectedVersion + 1;
    if (previous)
      await ctx.db.patch("courseQuizAnswers", previous._id, {
        answer,
        version,
        updatedAt: now,
      });
    else
      await ctx.db.insert("courseQuizAnswers", {
        taskId: task._id,
        recipientId: recipient._id,
        questionId: question._id,
        answer,
        version,
        updatedAt: now,
      });
    versions.push({ questionId: question._id, version });
  }
  return versions;
}

export function scoreQuizAnswers(
  questions: Doc<"courseQuizQuestions">[],
  answers: Doc<"courseQuizAnswers">[],
  manualScores: Infer<typeof courseQuizScoreValidator>[] = [],
) {
  const byQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer.answer]),
  );
  const manual = new Map(
    manualScores.map((score) => [score.questionId, score.points]),
  );
  return questions.map((question) => {
    const answer = byQuestion.get(question._id);
    if (question.kind === "text") {
      return {
        questionId: question._id,
        points:
          answer?.kind !== "text" || !answer.text.trim()
            ? 0
            : (manual.get(question._id) ?? null),
      };
    }
    const correct =
      question.kind === "single_choice"
        ? answer?.kind === "single_choice" &&
          answer.optionId === question.correctOptionId
        : answer?.kind === "multiple_choice" &&
          sameQuizOptionIds(answer.optionIds, question.correctOptionIds);
    return {
      questionId: question._id,
      points: correct ? question.maxPoints : 0,
    };
  });
}

export async function isValidQuizGrade(
  ctx: QueryCtx,
  task: Doc<"courseTasks">,
  recipient: Doc<"courseTaskRecipients">,
  result: Infer<typeof gradeResultValidator>,
  questions: Doc<"courseQuizQuestions">[],
) {
  const grading = task.grading;
  if (
    !grading ||
    !recipient.quizAttempt ||
    recipient.submittedAt === undefined ||
    result.submissionRevision !== recipient.submissionRevision ||
    !result.quizScores ||
    result.institutionalScale ||
    result.quizScores.length !== questions.length ||
    new Set(result.quizScores.map((score) => score.questionId)).size !==
      questions.length
  )
    return false;
  const scores = new Map(
    result.quizScores.map((score) => [score.questionId, score.points]),
  );
  if (
    questions.some((question) => {
      const points = scores.get(question._id);
      return (
        typeof points !== "number" ||
        !isValidPoints(points, question.maxPoints, grading.decimalPlaces)
      );
    })
  )
    return false;
  const expected = scoreQuizAnswers(
    questions,
    await listQuizAnswers(ctx, task._id, recipient._id),
    result.quizScores,
  );
  return (
    expected.every((score) => score.points === scores.get(score.questionId)) &&
    sumQuizPoints(
      expected.map((score) => score.points ?? 0),
      grading.decimalPlaces,
    ) === result.points
  );
}

export async function finalizeQuiz(
  ctx: MutationCtx,
  {
    task,
    recipient,
    questions,
    now,
    manual,
  }: {
    task: QuizTask;
    recipient: Doc<"courseTaskRecipients">;
    questions: Doc<"courseQuizQuestions">[];
    now: number;
    manual: boolean;
  },
) {
  if (recipient.submittedAt !== undefined) return recipient.submittedAt;
  const deadline = quizEndsAt(task, recipient);
  if (!manual && now < deadline) throw new ConvexError("QUIZ_STILL_OPEN");
  const submittedAt = now >= deadline ? deadline : now;
  const submissionRevision = recipient.submissionRevision + 1;
  const attempt = recipient.quizAttempt!;
  await ctx.db.patch("courseTaskRecipients", recipient._id, {
    submittedAt,
    submittedLate: false,
    submissionRevision,
    quizAttempt: {
      ...attempt,
      submissionReason:
        now < deadline
          ? "manual"
          : task.dueAt <= attempt.timeLimitAt
            ? "quiz_close"
            : "time_limit",
    },
  });
  if (questions.every(isAutomaticQuizQuestion)) {
    if (await findTaskGrade(ctx, task._id, recipient.studentId))
      throw new ConvexError("QUIZ_GRADE_EXISTS");
    const quizScores = scoreQuizAnswers(
      questions,
      await listQuizAnswers(ctx, task._id, recipient._id),
    ).map((score) => ({ ...score, points: score.points ?? 0 }));
    const operationId = `quiz:${recipient._id}:${submissionRevision}`;
    const gradeId = await ctx.db.insert("courseTaskGrades", {
      taskId: task._id,
      classId: task.classId,
      studentId: recipient.studentId,
      recipientId: recipient._id,
      version: 0,
      lastOperationId: operationId,
      lastOperationBy: null,
      lastOperationKind: "publish",
    });
    const grade = (await ctx.db.get("courseTaskGrades", gradeId))!;
    await publishTaskGrade(
      ctx,
      grade,
      {
        source: "automatic",
        points: sumQuizPoints(
          quizScores.map((score) => score.points),
          task.grading.decimalPlaces,
        ),
        quizScores,
        submissionRevision,
        updatedAt: now,
      },
      null,
      operationId,
    );
  }
  return submittedAt;
}

export async function deleteQuizDataBatch(
  ctx: MutationCtx,
  taskId: Id<"courseTasks">,
) {
  const questions = await ctx.db
    .query("courseQuizQuestions")
    .withIndex("by_taskId_and_order", (q) => q.eq("taskId", taskId))
    .take(50);
  const answers = await ctx.db
    .query("courseQuizAnswers")
    .withIndex("by_taskId_and_recipientId_and_questionId", (q) =>
      q.eq("taskId", taskId),
    )
    .take(50);
  for (const question of questions)
    await ctx.db.delete("courseQuizQuestions", question._id);
  for (const answer of answers)
    await ctx.db.delete("courseQuizAnswers", answer._id);
  return questions.length === 50 || answers.length === 50;
}
