import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { ensureCourseTaskRecipient } from "./model/courseTaskRecipients";
import {
  orderQuizQuestions,
  shuffleQuizQuestions,
} from "./model/courseQuizzes";

const NOW = Date.UTC(2026, 8, 28, 12);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
type Questions = FunctionArgs<typeof api.courseQuizzes.create>["questions"];
const CHOICE: Questions[number] = {
  kind: "single_choice",
  prompt: "Choose the answer",
  maxPoints: 2,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correctOptionId: "a",
};
const TEXT: Questions[number] = {
  kind: "text",
  prompt: "Explain",
  maxPoints: 8,
};
const MULTIPLE: Questions[number] = {
  kind: "multiple_choice",
  prompt: "Which animals are domestic?",
  maxPoints: 2,
  options: [
    { id: "cat", label: "Cat" },
    { id: "lion", label: "Lion" },
    { id: "dog", label: "Dog" },
    { id: "tiger", label: "Tiger" },
  ],
  correctOptionIds: ["cat", "dog"],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup(
  overrides: Partial<FunctionArgs<typeof api.courseQuizzes.create>> = {},
) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const data = await t.run(async (ctx) => {
    const roles = [
      "admin",
      "teacher",
      "student",
      "classmate",
      "outsider",
    ] as const;
    const users = {} as Record<(typeof roles)[number], Id<"users">>;
    for (const role of roles)
      users[role] = await ctx.db.insert("users", {
        clerkId: role,
        firstName: role,
        lastName: "Test",
        fullName: role,
        isActive: true,
        createdAt: NOW,
      });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      gradeCodes: ["05"],
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    await ctx.db.insert("roleAssignments", {
      userId: users.admin,
      role: "admin",
      orgType: "school",
      orgId: schoolId,
      schoolId,
      assignedAt: NOW,
    });
    for (const studentId of [users.student, users.classmate])
      await ctx.db.insert("roleAssignments", {
        userId: studentId,
        role: "student",
        orgType: "campus",
        orgId: campusId,
        schoolId,
        gradeCode: "05",
        assignedAt: NOW,
      });
    const classId = await ctx.db.insert("classes", {
      schoolId,
      campusId,
      curriculumId,
      teacherId: users.teacher,
      name: "Math 5",
      gradeCode: "05",
      endDate: NOW + 24 * HOUR,
      enrollmentsMigratedAt: NOW,
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    for (const studentId of [users.student, users.classmate])
      await ctx.db.insert("classEnrollments", {
        classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: users.admin,
      });
    return { users, classId, schoolId };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const createArgs = {
    classId: data.classId,
    title: "Quiz",
    dueAt: NOW + HOUR,
    durationMinutes: 30,
    questions: [CHOICE],
    ...overrides,
  };
  const taskId = await teacher.mutation(api.courseQuizzes.create, createArgs);
  const definition = await teacher.query(api.courseQuizzes.get, {
    taskId,
    now: NOW,
  });
  const task = await teacher.query(api.courseTasks.get, { taskId });
  const recipient = async (studentId = data.users.student) =>
    t.run((ctx) =>
      ctx.db
        .query("courseTaskRecipients")
        .withIndex("by_taskId_and_studentId", (q) =>
          q.eq("taskId", taskId).eq("studentId", studentId),
        )
        .unique(),
    );
  const reviewArgs = {
    taskId,
    studentId: data.users.student,
    expectedVersion: 0,
    expectedSubmissionRevision: 1,
    operationId: "review-1",
    expectedGrading: task!.grading!,
  };
  return {
    t,
    ...data,
    teacher,
    taskId,
    createArgs,
    definition,
    recipient,
    reviewArgs,
    student: t.withIdentity({ subject: "student" }),
    classmate: t.withIdentity({ subject: "classmate" }),
    outsider: t.withIdentity({ subject: "outsider" }),
  };
}

async function preparedGrade(s: Awaited<ReturnType<typeof setup>>) {
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({
    published: null,
    draft: null,
    version: 0,
    needsReview: false,
  });
  return s.teacher.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
    studentId: s.users.student,
  });
}

function choice(
  questionId: Id<"courseQuizQuestions">,
  optionId: string | null = "a",
  expectedVersion = 0,
) {
  return {
    questionId,
    answer: { kind: "single_choice" as const, optionId },
    expectedVersion,
  };
}
function textAnswer(
  questionId: Id<"courseQuizQuestions">,
  text = "My reasoning",
  expectedVersion = 0,
) {
  return {
    questionId,
    answer: { kind: "text" as const, text },
    expectedVersion,
  };
}

function multipleAnswer(
  questionId: Id<"courseQuizQuestions">,
  optionIds: string[],
  expectedVersion = 0,
) {
  return {
    questionId,
    answer: { kind: "multiple_choice" as const, optionIds },
    expectedVersion,
  };
}

test("a scheduled definition edits, reorders, adds and removes questions atomically, preserving grading policy", async () => {
  const s = await setup({
    availableAt: NOW + MINUTE,
    questions: [CHOICE, TEXT],
  });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  await s.t.run((ctx) =>
    ctx.db.patch("schools", s.schoolId, {
      gradingPolicy: { scaleMax: 5, decimalPlaces: 0, defaultMaxPoints: 5 },
    }),
  );
  const textId = before.questions![1]._id;
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    expectedUpdatedAt: before.task.updatedAt,
    title: "Corrected quiz",
    durationMinutes: 15,
    shuffleQuestions: true,
    questions: [
      { ...TEXT, _id: textId, prompt: "Updated reasoning", maxPoints: 3.5 },
      MULTIPLE,
    ],
  });
  const after = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  expect(after.task).toMatchObject({
    title: "Corrected quiz",
    quiz: { questionCount: 2, durationMinutes: 15, shuffleQuestions: true },
    grading: { ...before.task.grading, maxPoints: 5.5 },
  });
  expect(after.task.updatedAt).toBeGreaterThan(before.task.updatedAt);
  expect(after.questions).toMatchObject([
    { _id: textId, order: 0, prompt: "Updated reasoning", maxPoints: 3.5 },
    { ...MULTIPLE, order: 1 },
  ]);
  expect(
    await s.t.run((ctx) =>
      ctx.db.get("courseQuizQuestions", before.questions![0]._id),
    ),
  ).toBeNull();
  expect(await s.recipient()).toBeNull();
  await vi.advanceTimersByTimeAsync(MINUTE);
  await s.t.finishInProgressScheduledFunctions();
  const started = await s.student.mutation(api.courseQuizzes.start, {
    taskId: s.taskId,
  });
  expect(started.timeLimitAt - started.startedAt).toBe(15 * MINUTE);
  const visible = await s.student.query(api.courseQuizzes.getQuestions, {
    taskId: s.taskId,
  });
  expect(new Set(visible.map((q) => q._id))).toEqual(
    new Set(after.questions!.map((q) => q._id)),
  );
  expect(visible.find((q) => q.kind === "multiple_choice")).not.toHaveProperty(
    "correctOptionIds",
  );
  await expect(
    s.student.query(api.courseQuizzes.getForEditing, { taskId: s.taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const multiple = visible.find((q) => q.kind === "multiple_choice")!;
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [textAnswer(textId), multipleAnswer(multiple._id, ["cat", "dog"])],
  });
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toBeNull();
  const reviewArgs = { ...s.reviewArgs, expectedGrading: after.task.grading! };
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, {
    ...reviewArgs,
    scores: [{ questionId: textId, points: 3.5 }],
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...reviewArgs,
    expectedVersion: version,
    operationId: "publish-edited-definition",
  });
  const grade = await preparedGrade(s);
  expect(grade.published).toMatchObject({ points: 5.5 });
  expect(grade.grading).toMatchObject({
    maxPoints: 5.5,
    scaleMax: 100,
    decimalPlaces: 2,
  });
});

test("question edits require a version and concurrent editors cannot silently replace another definition", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  const args = {
    taskId: s.taskId,
    questions: [
      { ...CHOICE, _id: before.questions![0]._id, correctOptionId: "b" },
    ],
  };
  await expect(
    s.teacher.mutation(api.courseTasks.update, args),
  ).rejects.toThrow("QUIZ_SETTINGS_CHANGED");
  await s.teacher.mutation(api.courseTasks.update, {
    ...args,
    expectedUpdatedAt: before.task.updatedAt,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      ...args,
      expectedUpdatedAt: before.task.updatedAt,
      title: "Stale title",
    }),
  ).rejects.toThrow("QUIZ_SETTINGS_CHANGED");
  const after = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  expect(after.questions![0]).toMatchObject({ correctOptionId: "b" });
  expect(after.task.title).toBe(before.task.title);
});

test("maximum-size edits stay bounded and published edit settings do not load question bodies", async () => {
  const s = await setup({
    availableAt: NOW + MINUTE,
    questions: Array.from({ length: 50 }, () => ({
      ...CHOICE,
      prompt: "漢".repeat(10_000),
    })),
  });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  const metrics = await s.teacher.run(async (ctx) => {
    await ctx.runMutation(api.courseTasks.update, {
      taskId: s.taskId,
      expectedUpdatedAt: before.task.updatedAt,
      questions: s.createArgs.questions.map((question, index) => ({
        ...question,
        _id: before.questions![index]._id,
        ...(index === 0 && { prompt: "Changed question" }),
      })),
    });
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.bytesRead.used).toBeLessThan(2_000_000);
  expect(metrics.documentsWritten.used).toBe(2);
  const after = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  expect(after.questions?.map((q) => q._id)).toEqual(
    before.questions?.map((q) => q._id),
  );
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    availableAt: null,
  });
  const published = await s.teacher.run(async (ctx) => {
    const snapshot = await ctx.runQuery(api.courseQuizzes.getForEditing, {
      taskId: s.taskId,
    });
    return { snapshot, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(published.snapshot.questions).toBeNull();
  expect(published.metrics.bytesRead.used).toBeLessThan(200_000);
});

test.each(
  [
    [],
    Array.from({ length: 51 }, () => CHOICE),
    [{ ...CHOICE, maxPoints: 0 }],
    [{ ...CHOICE, maxPoints: 0.001 }],
    [{ ...MULTIPLE, correctOptionIds: ["missing"] }],
    [{ ...CHOICE, options: [CHOICE.options[0]] }],
  ].map((questions) => ({ questions })),
)(
  "invalid scheduled definitions roll back all settings: %j",
  async ({ questions }) => {
    const s = await setup({ availableAt: NOW + MINUTE });
    const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
      taskId: s.taskId,
    });
    await expect(
      s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        expectedUpdatedAt: before.task.updatedAt,
        title: "Must not save",
        dueAt: NOW + 2 * HOUR,
        questions,
      }),
    ).rejects.toThrow("INVALID_QUIZ_QUESTIONS");
    expect(
      await s.teacher.query(api.courseQuizzes.getForEditing, {
        taskId: s.taskId,
      }),
    ).toEqual(before);
  },
);

test("foreign and duplicate question IDs cannot be written or used to delete another quiz", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  const otherId = await s.teacher.mutation(api.courseQuizzes.create, {
    ...s.createArgs,
    title: "Other",
  });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  const other = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: otherId,
  });
  for (const ids of [
    [other.questions![0]._id],
    [before.questions![0]._id, before.questions![0]._id],
  ]) {
    await expect(
      s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        expectedUpdatedAt: before.task.updatedAt,
        questions: ids.map((_id) => ({ ...CHOICE, _id })),
      }),
    ).rejects.toThrow("INVALID_QUIZ_QUESTIONS");
  }
  expect(
    await s.teacher.query(api.courseQuizzes.getForEditing, {
      taskId: s.taskId,
    }),
  ).toEqual(before);
  expect(
    await s.teacher.query(api.courseQuizzes.getForEditing, { taskId: otherId }),
  ).toEqual(other);
});

test("editing a question kind removes the previous kind's fields without changing its ID", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  const _id = before.questions![0]._id;
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    expectedUpdatedAt: before.task.updatedAt,
    questions: [{ ...TEXT, _id }],
  });
  const after = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  expect(after.questions![0]).toMatchObject({
    _id,
    kind: "text",
    maxPoints: 8,
  });
  expect(after.questions![0]).not.toHaveProperty("correctOptionId");
  expect(after.questions![0]).not.toHaveProperty("options");
});

test("publication wins over an open editor even though release does not update the edit version", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  await vi.advanceTimersByTimeAsync(MINUTE);
  await s.t.finishInProgressScheduledFunctions();
  const after = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  expect(after.questions).toBeNull();
  expect(after.task.updatedAt).toBe(before.task.updatedAt);
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      expectedUpdatedAt: before.task.updatedAt,
      title: "Must not save",
      questions: [{ ...CHOICE, correctOptionId: "b" }],
    }),
  ).rejects.toThrow("QUIZ_QUESTIONS_LOCKED");
  expect(
    await s.teacher.query(api.courseQuizzes.getForEditing, {
      taskId: s.taskId,
    }),
  ).toEqual(after);
});

test("question edits and immediate publication use the corrected key for grading and release results only at closing", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  const _id = before.questions![0]._id;
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    expectedUpdatedAt: before.task.updatedAt,
    availableAt: null,
    questions: [
      { ...CHOICE, _id, correctOptionId: "b", maxPoints: 4 },
      MULTIPLE,
    ],
  });
  const published = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  expect(published.questions).toBeNull();
  expect(published.task.grading).toMatchObject({ maxPoints: 6, scaleMax: 100 });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const questions = await s.student.query(api.courseQuizzes.getQuestions, {
    taskId: s.taskId,
  });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [
      choice(_id, "b"),
      multipleAnswer(questions[1]._id, ["cat", "dog"]),
    ],
  });
  const grade = await preparedGrade(s);
  expect(grade.published).toMatchObject({ points: 6, source: "automatic" });
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
  await vi.advanceTimersByTimeAsync(HOUR);
  await s.t.finishInProgressScheduledFunctions();
  const review = await s.student.query(api.courseQuizzes.getReview, {
    taskId: s.taskId,
  });
  expect(review.questions[0]).toMatchObject({ _id, correctOptionId: "b" });
});

test("definition editing and its private query enforce managers, task kind and existing lifecycle locks", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  const before = await s.teacher.query(api.courseQuizzes.getForEditing, {
    taskId: s.taskId,
  });
  for (const actor of [s.student, s.outsider]) {
    await expect(
      actor.query(api.courseQuizzes.getForEditing, { taskId: s.taskId }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      actor.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        expectedUpdatedAt: before.task.updatedAt,
        questions: [TEXT],
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
  const fileId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Assignment",
    dueAt: NOW + HOUR,
  });
  await expect(
    s.teacher.query(api.courseQuizzes.getForEditing, { taskId: fileId }),
  ).rejects.toThrow("QUIZ_NOT_FOUND");
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: fileId,
      questions: [TEXT],
    }),
  ).rejects.toThrow("QUIZ_NOT_FOUND");
  for (const quiz of [
    { durationMinutes: 30, firstStartedAt: NOW },
    { durationMinutes: 30, closedAt: NOW },
  ]) {
    await s.t.run((ctx) => ctx.db.patch("courseTasks", s.taskId, { quiz }));
    await expect(
      s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        expectedUpdatedAt: before.task.updatedAt,
        questions: [TEXT],
      }),
    ).rejects.toThrow("QUIZ_QUESTIONS_LOCKED");
  }
});

test.each(Array.from({ length: 16 }, (_, mask) => mask))(
  "multiple choice gives full points only for the exact correct set: mask %s",
  async (mask) => {
    const s = await setup({ questions: [MULTIPLE] });
    const optionIds = MULTIPLE.options
      .filter((_, index) => mask & (1 << index))
      .map(({ id }) => id);
    await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
    await s.student.mutation(api.courseQuizzes.submit, {
      taskId: s.taskId,
      answers: [multipleAnswer(s.definition.questions[0]._id, optionIds)],
    });
    const grade = await preparedGrade(s);
    expect(grade.published).toMatchObject({
      source: "automatic",
      points: mask === 5 ? 2 : 0,
    });
    expect(grade.published).not.toHaveProperty("quizScores");
    expect((await s.recipient())?.submissionRevision).toBe(1);
  },
);

test("multiple choice validates keys and answers and retries regardless of option order", async () => {
  const s = await setup({ questions: [MULTIPLE] });
  for (const correctOptionIds of [
    [],
    ["cat", "cat"],
    ["other"],
    ["cat", "dog", "other"],
  ]) {
    await expect(
      s.teacher.mutation(api.courseQuizzes.create, {
        ...s.createArgs,
        questions: [{ ...MULTIPLE, correctOptionIds }],
      }),
    ).rejects.toThrow("INVALID_QUIZ_QUESTIONS");
  }
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const questionId = s.definition.questions[0]._id;
  for (const optionIds of [
    ["cat", "cat"],
    ["other"],
    Array.from({ length: 11 }, () => "cat"),
  ]) {
    await expect(
      s.student.mutation(api.courseQuizzes.saveAnswers, {
        taskId: s.taskId,
        answers: [multipleAnswer(questionId, optionIds)],
      }),
    ).rejects.toThrow("INVALID_QUIZ_ANSWERS");
  }
  const saved = await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [multipleAnswer(questionId, ["cat", "dog"])],
  });
  expect(
    await s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [multipleAnswer(questionId, ["dog", "cat"])],
    }),
  ).toEqual(saved);
  await expect(
    s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [multipleAnswer(questionId, ["cat"])],
    }),
  ).rejects.toThrow("QUIZ_ANSWER_CHANGED");
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [multipleAnswer(questionId, ["dog", "cat"], 1)],
  });
  expect((await preparedGrade(s)).published?.points).toBe(2);
  const questions = await s.student.query(api.courseQuizzes.getQuestions, {
    taskId: s.taskId,
  });
  expect(questions[0]).not.toHaveProperty("correctOptionIds");
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + HOUR,
  });
  expect(
    (await s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }))
      .questions[0],
  ).toHaveProperty("correctOptionIds", ["cat", "dog"]);
});

test("mixed automatic question types publish together and text questions keep manual review", async () => {
  const automatic = await setup({ questions: [CHOICE, MULTIPLE] });
  await automatic.student.mutation(api.courseQuizzes.start, {
    taskId: automatic.taskId,
  });
  await automatic.student.mutation(api.courseQuizzes.submit, {
    taskId: automatic.taskId,
    answers: [
      choice(automatic.definition.questions[0]._id),
      multipleAnswer(automatic.definition.questions[1]._id, ["dog", "cat"]),
    ],
  });
  expect((await preparedGrade(automatic)).published).toMatchObject({
    source: "automatic",
    points: 4,
  });
  const s = await setup({ questions: [MULTIPLE, TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const [multiple, text] = s.definition.questions;
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [
      multipleAnswer(multiple._id, ["dog", "cat"]),
      textAnswer(text._id),
    ],
  });
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toBeNull();
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...s.reviewArgs,
      scores: [{ questionId: multiple._id, points: 1 }],
    }),
  ).rejects.toThrow("INVALID_QUIZ_SCORES");
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, {
    ...s.reviewArgs,
    scores: [{ questionId: text._id, points: 8 }],
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.reviewArgs,
    expectedVersion: version,
    operationId: "publish-mixed",
  });
  expect((await preparedGrade(s)).published?.points).toBe(10);
});

test("multiple choice expiry grades only saved selections and ignores late changes", async () => {
  const s = await setup({ questions: [MULTIPLE], durationMinutes: 1 });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const questionId = s.definition.questions[0]._id;
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [multipleAnswer(questionId, ["cat", "dog"])],
  });
  vi.setSystemTime(NOW + MINUTE);
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [multipleAnswer(questionId, ["lion"], 1)],
  });
  expect((await preparedGrade(s)).published).toMatchObject({
    source: "automatic",
    points: 2,
  });
});

test("creation is atomic, validates question configuration and captures the grading policy", async () => {
  const s = await setup();
  const invalid: Partial<typeof s.createArgs>[] = [
    { title: " " },
    { durationMinutes: 0 },
    { durationMinutes: 1.5 },
    { durationMinutes: Infinity },
    { dueAt: NOW },
    { questions: [] },
    { questions: Array.from({ length: 51 }, () => CHOICE) },
    { questions: [{ ...TEXT, maxPoints: 0 }] },
    { questions: [{ ...TEXT, maxPoints: 0.001 }] },
    { questions: [{ ...TEXT, maxPoints: NaN }] },
    { questions: [{ ...TEXT, prompt: " " }] },
    {
      questions: [
        {
          ...CHOICE,
          kind: "single_choice",
          options: [{ id: "a", label: "A" }],
          correctOptionId: "a",
        },
      ],
    },
    {
      questions: [
        {
          ...CHOICE,
          kind: "single_choice",
          options: [
            { id: "a", label: "A" },
            { id: "a", label: "B" },
          ],
          correctOptionId: "a",
        },
      ],
    },
    {
      questions: [
        {
          ...CHOICE,
          kind: "single_choice",
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          correctOptionId: "missing",
        },
      ],
    },
  ];
  for (const args of invalid)
    await expect(
      s.teacher.mutation(api.courseQuizzes.create, {
        ...s.createArgs,
        ...args,
      }),
    ).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTasks").collect()),
  ).toHaveLength(1);
  const taskId = await s.teacher.mutation(api.courseQuizzes.create, {
    ...s.createArgs,
    questions: [
      { ...TEXT, maxPoints: 0.1 },
      { ...TEXT, maxPoints: 0.2 },
    ],
  });
  expect(await s.teacher.query(api.courseTasks.get, { taskId })).toMatchObject({
    kind: "quiz",
    allowLateSubmissions: false,
    grading: { maxPoints: 0.3, decimalPlaces: 2 },
  });
});

test("scheduled quizzes and answer keys respect roles and explicit start", async () => {
  const s = await setup({ availableAt: NOW + MINUTE });
  await expect(
    s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
  ).rejects.toThrow();
  await expect(
    s.outsider.query(api.courseQuizzes.get, { taskId: s.taskId, now: NOW }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await vi.advanceTimersByTimeAsync(MINUTE);
  await s.t.finishInProgressScheduledFunctions();
  const before = await s.student.query(api.courseQuizzes.get, {
    taskId: s.taskId,
    now: NOW + HOUR,
  });
  expect(before.questions).toEqual([]);
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const after = await s.student.query(api.courseQuizzes.get, {
    taskId: s.taskId,
    now: NOW + MINUTE,
  });
  expect(after.questions).toHaveLength(1);
  expect(after.questions[0]).not.toHaveProperty("correctOptionId");
  expect(s.definition.questions[0]).toHaveProperty("correctOptionId", "a");
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
});

test("start is idempotent, crops time at closing and locks duration after the first attempt", async () => {
  const s = await setup({ dueAt: NOW + 10 * MINUTE });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    durationMinutes: 20,
  });
  const first = await s.student.mutation(api.courseQuizzes.start, {
    taskId: s.taskId,
  });
  vi.setSystemTime(NOW + MINUTE);
  const second = await s.student.mutation(api.courseQuizzes.start, {
    taskId: s.taskId,
  });
  expect(first).toMatchObject({
    startedAt: NOW,
    timeLimitAt: NOW + 20 * MINUTE,
    endsAt: NOW + 10 * MINUTE,
  });
  expect(second).toMatchObject({
    startedAt: first.startedAt,
    timeLimitAt: first.timeLimitAt,
    endsAt: first.endsAt,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      durationMinutes: 21,
    }),
  ).rejects.toThrow("QUIZ_DURATION_LOCKED");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    durationMinutes: 20,
  });
  expect((await s.recipient())?.submissionRevision).toBe(0);
});

test("autosave retries are idempotent, reject stale changes and leave recipient state untouched", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const before = await s.recipient();
  const answers = [
    choice(s.definition.questions[0]._id),
    textAnswer(s.definition.questions[1]._id),
  ];
  const save = () =>
    s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers,
    });
  const result = await save();
  expect(await save()).toEqual(result);
  expect(result.map((answer) => answer.version)).toEqual([1, 1]);
  await expect(
    s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [choice(s.definition.questions[0]._id, "b")],
    }),
  ).rejects.toThrow("QUIZ_ANSWER_CHANGED");
  expect(await s.recipient()).toEqual(before);
  expect(
    (
      await s.student.query(api.courseQuizzes.get, {
        taskId: s.taskId,
        now: NOW,
      })
    ).answers,
  ).toHaveLength(2);
});

test("an invalid answer rolls back the entire batch and cannot cross quiz or student boundaries", async () => {
  const s = await setup();
  const otherId = await s.teacher.mutation(
    api.courseQuizzes.create,
    s.createArgs,
  );
  const other = await s.teacher.query(api.courseQuizzes.get, {
    taskId: otherId,
    now: NOW,
  });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const id = s.definition.questions[0]._id;
  const batches = [
    [choice(id), choice(other.questions[0]._id)],
    [choice(id, "unknown")],
    [choice(id), choice(id)],
    [textAnswer(id)],
    [choice(id, "a", -1)],
  ];
  for (const answers of batches)
    await expect(
      s.student.mutation(api.courseQuizzes.saveAnswers, {
        taskId: s.taskId,
        answers,
      }),
    ).rejects.toThrow("INVALID_QUIZ_ANSWERS");
  expect(
    await s.t.run((ctx) => ctx.db.query("courseQuizAnswers").collect()),
  ).toEqual([]);
  await expect(
    s.classmate.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [choice(id)],
    }),
  ).rejects.toThrow("QUIZ_NOT_STARTED");
  await expect(
    s.student.query(api.courseQuizzes.getReview, {
      taskId: s.taskId,
      studentId: s.users.classmate,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("manual submission includes pending answers, publishes automatically once and hides the breakdown until global close", async () => {
  const s = await setup();
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const submitted = await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id)],
  });
  expect(
    await s.student.mutation(api.courseQuizzes.submit, { taskId: s.taskId }),
  ).toEqual(submitted);
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: (await s.recipient())!._id,
  });
  const grade = await preparedGrade(s);
  expect(grade.published).toMatchObject({ source: "automatic", points: 2 });
  expect(grade.published).not.toHaveProperty("quizScores");
  expect(grade.published).not.toHaveProperty("authorId");
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskGradeHistory").collect()),
  ).toHaveLength(1);
  expect(await s.recipient()).toMatchObject({
    submissionRevision: 1,
    submittedLate: false,
    quizAttempt: { submissionReason: "manual" },
  });
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
  expect(
    (
      await s.student.query(api.courseQuizzes.get, {
        taskId: s.taskId,
        now: NOW + 2 * HOUR,
      })
    ).questions[0],
  ).not.toHaveProperty("correctOptionId");
  await expect(
    s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [],
    }),
  ).rejects.toThrow("QUIZ_ALREADY_SUBMITTED");
  await s.classmate.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + HOUR,
  });
  const review = await s.student.query(api.courseQuizzes.getReview, {
    taskId: s.taskId,
  });
  expect(review.questions[0]).toHaveProperty("correctOptionId", "a");
  expect(review.scores).toEqual([
    { questionId: s.definition.questions[0]._id, points: 2 },
  ]);
  expect(
    (await s.classmate.query(api.courseQuizzes.getReview, { taskId: s.taskId }))
      .questions[0],
  ).toHaveProperty("correctOptionId", "a");
});

test("expiry submits saved work at the deadline and ignores a late final payload", async () => {
  const s = await setup({ durationMinutes: 10 });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id, "b")],
  });
  vi.setSystemTime(NOW + 11 * MINUTE);
  await expect(
    s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [choice(s.definition.questions[0]._id, "a", 1)],
    }),
  ).rejects.toThrow("QUIZ_TIME_EXPIRED");
  expect(
    await s.student.mutation(api.courseQuizzes.submit, {
      taskId: s.taskId,
      answers: [choice(s.definition.questions[0]._id, "a", 1)],
    }),
  ).toEqual({ submittedAt: NOW + 10 * MINUTE });
  expect((await preparedGrade(s)).published).toMatchObject({ points: 0 });
  expect(await s.recipient()).toMatchObject({
    submittedLate: false,
    quizAttempt: { submissionReason: "time_limit" },
  });
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
});

test("scheduled expiry preserves saved answers without an active student session or enrollment", async () => {
  const s = await setup({ durationMinutes: 1 });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id)],
  });
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.delete("classEnrollments", enrollment!._id);
  });
  vi.setSystemTime(NOW + MINUTE);
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: (await s.recipient())!._id,
  });
  expect(await s.recipient()).toMatchObject({
    submittedAt: NOW + MINUTE,
    submissionRevision: 1,
  });
  expect(
    (
      await s.teacher.query(api.courseTaskGrades.get, {
        taskId: s.taskId,
        studentId: s.users.student,
      })
    ).published,
  ).toMatchObject({ points: 2 });
  await expect(
    s.student.mutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("extending closing rechecks old callbacks without resetting the individual limit or reopening submitted attempts", async () => {
  const s = await setup({ dueAt: NOW + 10 * MINUTE, durationMinutes: 30 });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.classmate.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.classmate.mutation(api.courseQuizzes.submit, { taskId: s.taskId });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + HOUR,
  });
  vi.setSystemTime(NOW + 10 * MINUTE);
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + 10 * MINUTE,
  });
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: (await s.recipient())!._id,
  });
  expect((await s.recipient())?.submittedAt).toBeUndefined();
  expect(
    await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
  ).toMatchObject({
    startedAt: NOW,
    timeLimitAt: NOW + 30 * MINUTE,
    endsAt: NOW + 30 * MINUTE,
  });
  expect(
    (await s.classmate.mutation(api.courseQuizzes.start, { taskId: s.taskId }))
      .submittedAt,
  ).toBe(NOW);
  vi.setSystemTime(NOW + 30 * MINUTE);
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: (await s.recipient())!._id,
  });
  expect((await s.recipient())?.submittedAt).toBe(NOW + 30 * MINUTE);
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
});

test("shortening closing finalizes started attempts in bounded batches, with no backdating or reopening", async () => {
  const s = await setup();
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const original = (await s.recipient())!;
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 11; i++) {
      const studentId = await ctx.db.insert("users", {
        clerkId: `extra-${i}`,
        firstName: "Extra",
        lastName: "Student",
        fullName: "Extra",
        isActive: true,
        createdAt: NOW,
      });
      await ctx.db.insert("classEnrollments", {
        classId: s.classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: s.users.admin,
      });
      const id = await ensureCourseTaskRecipient(ctx, s.taskId, studentId);
      await ctx.db.patch("courseTaskRecipients", id, {
        quizAttempt: { startedAt: NOW, timeLimitAt: NOW + 30 * MINUTE },
      });
    }
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + 5 * MINUTE,
  });
  vi.setSystemTime(NOW + 5 * MINUTE);
  await expect(
    s.classmate.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
  ).rejects.toThrow("TASK_SUBMISSION_CLOSED");
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + 5 * MINUTE,
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const recipients = await s.t.run((ctx) =>
    ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", s.taskId))
      .collect(),
  );
  const started = recipients.filter((r) => r.quizAttempt);
  expect(started).toHaveLength(12);
  expect(
    started.every(
      (r) =>
        r.submittedAt === NOW + 5 * MINUTE &&
        r.submissionRevision === 1 &&
        r.quizAttempt?.submissionReason === "quiz_close",
    ),
  ).toBe(true);
  expect(
    recipients.find((r) => r.studentId === s.users.classmate)?.submittedAt,
  ).toBeUndefined();
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: original._id,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskGradeHistory").collect()),
  ).toHaveLength(12);
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      dueAt: Date.now() + HOUR,
    }),
  ).rejects.toThrow("QUIZ_CLOSED");
});

test("legacy file and grading operations cannot bypass quiz rules", async () => {
  const s = await setup();
  for (const update of [
    { dueAt: null },
    { allowLateSubmissions: true },
    { grading: null },
    { grading: { maxPoints: 3 } },
  ])
    await expect(
      s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        ...update,
      }),
    ).rejects.toThrow();
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      dueAt: NOW - MINUTE,
    }),
  ).rejects.toThrow("QUIZ_CLOSED");
  await expect(
    s.teacher.mutation(api.courseTasks.setClosed, {
      taskId: s.taskId,
      closed: true,
    }),
  ).rejects.toThrow("QUIZ_USE_CLOSING_DATE");
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.reviewArgs,
      expectedSubmissionRevision: 0,
      points: 2,
    }),
  ).rejects.toThrow("QUIZ_REVIEW_REQUIRED");
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [],
    }),
  ).rejects.toThrow("QUIZ_REQUIRES_ANSWERS");
  await expect(
    s.student.mutation(internal.courseTaskFiles.reserve, {
      taskId: s.taskId,
      name: "answer.pdf",
      contentType: "application/pdf",
      size: 100,
    }),
  ).rejects.toThrow("QUIZ_FILES_NOT_SUPPORTED");
});

test("mixed reviews calculate choice points on the server, keep partial drafts private and publish through the existing grade flow", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [
      choice(s.definition.questions[0]._id),
      textAnswer(s.definition.questions[1]._id),
    ],
  });
  const review = await s.teacher.query(api.courseQuizzes.getReview, {
    taskId: s.taskId,
    studentId: s.users.student,
  });
  expect(review.scores.map((score) => score.points)).toEqual([2, null]);
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, {
    ...s.reviewArgs,
    scores: [],
  });
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .draft,
  ).toBeNull();
  await expect(
    s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.reviewArgs,
      operationId: "publish",
      expectedVersion: version,
    }),
  ).rejects.toThrow("QUIZ_REVIEW_INCOMPLETE");
  expect(
    await s.teacher.query(api.courseTaskGrades.hasPublishableDrafts, {
      taskId: s.taskId,
    }),
  ).toBe(false);
  expect(
    await s.teacher.mutation(api.courseTaskGrades.publishAll, {
      taskId: s.taskId,
      operationId: "bulk-incomplete",
    }),
  ).toMatchObject({ published: 0, skipped: 1 });
  const completedVersion = await s.teacher.mutation(
    api.courseQuizzes.saveReview,
    {
      ...s.reviewArgs,
      expectedVersion: version,
      operationId: "complete-review",
      scores: [{ questionId: s.definition.questions[1]._id, points: 6 }],
      comment: " Good work ",
    },
  );
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.reviewArgs,
    expectedVersion: completedVersion,
    operationId: "publish-complete",
  });
  expect((await preparedGrade(s)).published).toMatchObject({
    points: 8,
    comment: "Good work",
    source: "manual",
  });
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + HOUR,
  });
  expect(
    (
      await s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId })
    ).scores.map((score) => score.points),
  ).toEqual([2, 6]);
});

test("review rejects forged scores and stale writes, while retries preserve the same version", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...s.reviewArgs,
      scores: [],
    }),
  ).rejects.toThrow("QUIZ_NOT_SUBMITTED");
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [textAnswer(s.definition.questions[1]._id)],
  });
  const id = s.definition.questions[1]._id;
  for (const scores of [
    [{ questionId: s.definition.questions[0]._id, points: 2 }],
    [{ questionId: id, points: 9 }],
    [{ questionId: id, points: -1 }],
    [{ questionId: id, points: 0.001 }],
    [
      { questionId: id, points: 1 },
      { questionId: id, points: 1 },
    ],
  ])
    await expect(
      s.teacher.mutation(api.courseQuizzes.saveReview, {
        ...s.reviewArgs,
        scores,
      }),
    ).rejects.toThrow("INVALID_QUIZ_SCORES");
  const args = { ...s.reviewArgs, scores: [{ questionId: id, points: 4 }] };
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, args);
  expect(await s.teacher.mutation(api.courseQuizzes.saveReview, args)).toBe(
    version,
  );
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...args,
      scores: [{ questionId: id, points: 5 }],
    }),
  ).rejects.toThrow("INVALID_GRADE_REQUEST");
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...args,
      operationId: "stale",
    }),
  ).rejects.toThrow("GRADE_CHANGED");
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...args,
      expectedSubmissionRevision: 0,
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CHANGED");
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...args,
      expectedGrading: { ...args.expectedGrading, maxPoints: 99 },
    }),
  ).rejects.toThrow("TASK_GRADING_CHANGED");
});

test("blank text scores zero and still follows manual publication", async () => {
  const s = await setup({ questions: [TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, { taskId: s.taskId });
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toBeNull();
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, {
    ...s.reviewArgs,
    scores: [{ questionId: s.definition.questions[0]._id, points: 8 }],
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.reviewArgs,
    expectedVersion: version,
    operationId: "publish",
  });
  expect((await preparedGrade(s)).published).toMatchObject({ points: 0 });
});

test("publication revalidates stored quiz totals and automatic scores, individually and in bulk", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [textAnswer(s.definition.questions[1]._id)],
  });
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, {
    ...s.reviewArgs,
    scores: [{ questionId: s.definition.questions[1]._id, points: 4 }],
  });
  await s.t.run(async (ctx) => {
    const grade = await ctx.db
      .query("courseTaskGrades")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", s.taskId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.patch("courseTaskGrades", grade!._id, {
      draft: {
        ...grade!.draft!,
        points: 6,
        quizScores: [
          { questionId: s.definition.questions[0]._id, points: 2 },
          { questionId: s.definition.questions[1]._id, points: 4 },
        ],
      },
    });
  });
  await expect(
    s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.reviewArgs,
      expectedVersion: version,
      operationId: "publish-corrupt",
    }),
  ).rejects.toThrow("QUIZ_REVIEW_INCOMPLETE");
  expect(
    await s.teacher.mutation(api.courseTaskGrades.publishAll, {
      taskId: s.taskId,
      operationId: "bulk-corrupt",
    }),
  ).toMatchObject({ published: 0, skipped: 1 });
});

test("deleting an ungraded quiz cleans questions, answers and scheduled attempts without resurrection", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [textAnswer(s.definition.questions[1]._id)],
  });
  const recipientId = (await s.recipient())!._id;
  await s.teacher.mutation(api.courseTasks.remove, { taskId: s.taskId });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await s.t.mutation(internal.courseQuizzes.expire, { recipientId });
  const remaining = await s.t.run(async (ctx) => ({
    questions: await ctx.db.query("courseQuizQuestions").collect(),
    answers: await ctx.db.query("courseQuizAnswers").collect(),
    recipients: await ctx.db.query("courseTaskRecipients").collect(),
    grades: await ctx.db.query("courseTaskGrades").collect(),
  }));
  expect(remaining).toEqual({
    questions: [],
    answers: [],
    recipients: [],
    grades: [],
  });
});

test("the scheduled clock submits and releases reviews without a connected client", async () => {
  const s = await setup({ dueAt: NOW + 2 * MINUTE, durationMinutes: 1 });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id)],
  });
  await vi.advanceTimersByTimeAsync(MINUTE);
  await s.t.finishInProgressScheduledFunctions();
  expect(await s.recipient()).toMatchObject({
    submittedAt: NOW + MINUTE,
    submissionRevision: 1,
  });
  await expect(
    s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
  ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
  await vi.advanceTimersByTimeAsync(MINUTE);
  await s.t.finishInProgressScheduledFunctions();
  expect(
    (await s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }))
      .scores[0].points,
  ).toBe(2);
});

test("bulk quiz grades paginate without dropping drafts when publication removes indexed fields", async () => {
  const s = await setup({ questions: [TEXT] });
  const questionId = s.definition.questions[0]._id;
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 12; i++) {
      const studentId = await ctx.db.insert("users", {
        clerkId: `bulk-${i}`,
        firstName: "Bulk",
        lastName: "Student",
        fullName: "Bulk",
        isActive: true,
        createdAt: NOW,
      });
      await ctx.db.insert("classEnrollments", {
        classId: s.classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: s.users.admin,
      });
      const recipientId = await ensureCourseTaskRecipient(
        ctx,
        s.taskId,
        studentId,
      );
      await ctx.db.patch("courseTaskRecipients", recipientId, {
        quizAttempt: { startedAt: NOW, timeLimitAt: NOW + 30 * MINUTE },
        submittedAt: NOW,
        submissionRevision: 1,
      });
      await ctx.db.insert("courseQuizAnswers", {
        taskId: s.taskId,
        recipientId,
        questionId,
        answer: { kind: "text", text: "An answer" },
        version: 1,
        updatedAt: NOW,
      });
      await ctx.db.insert("courseTaskGrades", {
        taskId: s.taskId,
        classId: s.classId,
        recipientId,
        studentId,
        version: 1,
        lastOperationId: "draft",
        lastOperationBy: s.users.teacher,
        lastOperationKind: "draft",
        draft: {
          points: i === 11 ? 0 : 4,
          quizScores: [{ questionId, points: i === 11 ? null : 4 }],
          authorId: s.users.teacher,
          submissionRevision: 1,
          updatedAt: NOW,
        },
      });
    }
  });
  let continuation: FunctionArgs<
    typeof api.courseTaskGrades.publishAll
  >["continuation"];
  let published = 0;
  let skipped = 0;
  let pages = 0;
  do {
    const result = await s.teacher.mutation(api.courseTaskGrades.publishAll, {
      taskId: s.taskId,
      operationId: "bulk",
      continuation,
    });
    published += result.published;
    skipped += result.skipped;
    continuation = result.continuation ?? undefined;
    pages++;
  } while (continuation && pages < 10);
  expect({ published, skipped, pages }).toEqual({
    published: 11,
    skipped: 1,
    pages: 3,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskGradeHistory").collect()),
  ).toHaveLength(11);
});

test("automatic grades retain decimal precision, institutional scale and existing deletion protection", async () => {
  const s = await setup({
    questions: [
      { ...CHOICE, maxPoints: 0.1 },
      { ...CHOICE, maxPoints: 0.2 },
    ],
  });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: s.definition.questions.map((question) => choice(question._id)),
  });
  const state = await preparedGrade(s);
  expect(state.published?.points).toBe(0.3);
  expect(state.grading).toMatchObject({
    maxPoints: 0.3,
    scaleMax: 100,
    decimalPlaces: 2,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.remove, { taskId: s.taskId }),
  ).rejects.toThrow("TASK_HAS_GRADES");
});

test("course deletion cleans quiz rows and prevents pending expiration from creating orphan grades", async () => {
  const s = await setup();
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id)],
  });
  await s.t.run((ctx) => ctx.db.delete("classes", s.classId));
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: (await s.recipient())!._id,
  });
  await s.t.mutation(internal.courseTasks.removeByClass, {
    classId: s.classId,
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const count = await s.t.run(async (ctx) => ({
    tasks: (await ctx.db.query("courseTasks").collect()).length,
    questions: (await ctx.db.query("courseQuizQuestions").collect()).length,
    answers: (await ctx.db.query("courseQuizAnswers").collect()).length,
    grades: (await ctx.db.query("courseTaskGrades").collect()).length,
  }));
  expect(count).toEqual({ tasks: 0, questions: 0, answers: 0, grades: 0 });
});

test("autosaving one answer reads only that question and answer even at the maximum quiz size", async () => {
  const longText = "漢".repeat(10_000);
  const s = await setup({
    questions: Array.from({ length: 50 }, () => ({
      ...TEXT,
      prompt: longText,
    })),
  });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: s.definition.questions.map((question) =>
      textAnswer(question._id, longText),
    ),
  });
  const metrics = await s.student.run(async (ctx) => {
    await ctx.runMutation(api.courseQuizzes.saveAnswers, {
      taskId: s.taskId,
      answers: [textAnswer(s.definition.questions[0]._id, longText + "", 1)],
    });
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.bytesRead.used).toBeLessThan(200_000);
  expect(metrics.documentsWritten.used).toBe(1);
  expect((await s.recipient())?.submissionRevision).toBe(0);

  const reads = await s.student.run(async (ctx) => {
    const attempt = await ctx.runQuery(api.courseQuizzes.getAttempt, {
      taskId: s.taskId,
      now: NOW,
    });
    return { attempt, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(reads.attempt).not.toHaveProperty("questions");
  expect(reads.attempt.answers).toHaveLength(50);
  expect(reads.metrics.bytesRead.used).toBeLessThan(1_600_000);
});

test("split reads preserve access, question keys, answer versions and the combined query contract", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  expect(
    await s.student.query(api.courseQuizzes.getQuestions, { taskId: s.taskId }),
  ).toEqual([]);
  expect(
    (
      await s.student.query(api.courseQuizzes.getAttempt, {
        taskId: s.taskId,
        now: NOW,
      })
    ).answers,
  ).toEqual([]);
  const teacherQuestions = await s.teacher.query(
    api.courseQuizzes.getQuestions,
    { taskId: s.taskId },
  );
  expect(teacherQuestions[0]).toHaveProperty("correctOptionId", "a");
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const questions = await s.student.query(api.courseQuizzes.getQuestions, {
    taskId: s.taskId,
  });
  expect(questions).toHaveLength(2);
  expect(questions[0]).not.toHaveProperty("correctOptionId");
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [choice(questions[0]._id), textAnswer(questions[1]._id, "Saved")],
  });
  const attempt = await s.student.query(api.courseQuizzes.getAttempt, {
    taskId: s.taskId,
    now: NOW,
  });
  expect(attempt.answers).toHaveLength(2);
  expect(attempt.answers.every((answer) => answer.version === 1)).toBe(true);
  expect(attempt).not.toHaveProperty("questions");
  expect(
    await s.student.query(api.courseQuizzes.getQuestions, { taskId: s.taskId }),
  ).toEqual(questions);
  expect(
    await s.student.query(api.courseQuizzes.get, {
      taskId: s.taskId,
      now: NOW,
    }),
  ).toEqual({ ...attempt, questions });
  expect(
    (
      await s.classmate.query(api.courseQuizzes.getAttempt, {
        taskId: s.taskId,
        now: NOW,
      })
    ).answers,
  ).toEqual([]);
});

test("the server rejects extending an expired quiz even before its close callback runs", async () => {
  const s = await setup({ dueAt: NOW + MINUTE });
  vi.setSystemTime(NOW + 2 * MINUTE);
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: s.taskId }))?.quiz
      ?.closedAt,
  ).toBeUndefined();
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      dueAt: NOW + HOUR,
    }),
  ).rejects.toThrow("QUIZ_CLOSED");
});

test("stale quiz settings cannot reverse a concurrent extension even within the same millisecond", async () => {
  const s = await setup({ dueAt: NOW + 10 * MINUTE });
  const before = await s.teacher.query(api.courseTasks.get, {
    taskId: s.taskId,
  });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + 30 * MINUTE,
    expectedUpdatedAt: before!.updatedAt,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      title: "Edited title",
      dueAt: before!.dueAt,
      expectedUpdatedAt: before!.updatedAt,
    }),
  ).rejects.toThrow("QUIZ_SETTINGS_CHANGED");
  const current = await s.teacher.query(api.courseTasks.get, {
    taskId: s.taskId,
  });
  expect(current!.dueAt).toBe(NOW + 30 * MINUTE);
  expect(current!.title).toBe(before!.title);
  expect(current!.updatedAt).toBeGreaterThan(before!.updatedAt);
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    title: "Edited title",
    expectedUpdatedAt: current!.updatedAt,
  });
  const timing = await s.student.mutation(api.courseQuizzes.start, {
    taskId: s.taskId,
  });
  expect(timing.endsAt).toBe(NOW + 30 * MINUTE);
  expect(timing.timeLimitAt).toBe(NOW + 30 * MINUTE);
});

test("simultaneous conflicting saves cannot silently overwrite a newer answer", async () => {
  const s = await setup();
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const results = await Promise.allSettled(
    ["a", "b"].map((optionId) =>
      s.student.mutation(api.courseQuizzes.saveAnswers, {
        taskId: s.taskId,
        answers: [choice(s.definition.questions[0]._id, optionId)],
      }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const failed = results.find((result) => result.status === "rejected");
  expect(failed?.reason.message).toContain("QUIZ_ANSWER_CHANGED");
  expect(
    (
      await s.student.query(api.courseQuizzes.get, {
        taskId: s.taskId,
        now: NOW,
      })
    ).answers[0].version,
  ).toBe(1);
});

test("every public quiz operation enforces authentication and course boundaries before exposing or changing data", async () => {
  const s = await setup();
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id)],
  });
  for (const client of [s.t, s.outsider]) {
    const calls: (() => Promise<unknown>)[] = [
      () => client.mutation(api.courseQuizzes.create, s.createArgs),
      () => client.query(api.courseQuizzes.get, { taskId: s.taskId, now: NOW }),
      () =>
        client.query(api.courseQuizzes.getAttempt, {
          taskId: s.taskId,
          now: NOW,
        }),
      () => client.query(api.courseQuizzes.getQuestions, { taskId: s.taskId }),
      () => client.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
      () =>
        client.mutation(api.courseQuizzes.saveAnswers, {
          taskId: s.taskId,
          answers: [choice(s.definition.questions[0]._id, "b", 1)],
        }),
      () => client.mutation(api.courseQuizzes.submit, { taskId: s.taskId }),
      () =>
        client.query(api.courseQuizzes.getReview, {
          taskId: s.taskId,
          studentId: s.users.student,
        }),
      () =>
        client.mutation(api.courseQuizzes.saveReview, {
          ...s.reviewArgs,
          scores: [],
        }),
      () =>
        client.query(api.courseTaskGrades.get, {
          taskId: s.taskId,
          studentId: s.users.student,
        }),
      () =>
        client.query(api.courseTaskSubmissions.listForTask, {
          taskId: s.taskId,
          paginationOpts: { numItems: 10, cursor: null },
        }),
      () =>
        client.mutation(api.courseTaskGrades.publishAll, {
          taskId: s.taskId,
          operationId: "unauthorized",
        }),
    ];
    for (const call of calls)
      await expect(call()).rejects.toThrow(
        /not authenticated|PERMISSION_DENIED/,
      );
  }
  await expect(
    s.classmate.query(api.courseQuizzes.getReview, {
      taskId: s.taskId,
      studentId: s.users.student,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.mutation(api.courseQuizzes.create, s.createArgs),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.mutation(api.courseQuizzes.saveReview, {
      ...s.reviewArgs,
      scores: [],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const snapshot = await s.t.run(async (ctx) => ({
    tasks: (await ctx.db.query("courseTasks").collect()).length,
    answers: await ctx.db.query("courseQuizAnswers").collect(),
    history: await ctx.db.query("courseTaskGradeHistory").collect(),
  }));
  expect(snapshot.tasks).toBe(1);
  expect(snapshot.answers).toHaveLength(1);
  expect(snapshot.answers[0].answer).toEqual({
    kind: "single_choice",
    optionId: "a",
  });
  expect(snapshot.history).toHaveLength(1);
});

test("manual submit racing global closure at the exact deadline publishes saved work only once", async () => {
  const s = await setup({ dueAt: NOW + MINUTE });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [choice(s.definition.questions[0]._id)],
  });
  vi.setSystemTime(NOW + MINUTE);
  await Promise.all([
    s.student.mutation(api.courseQuizzes.submit, {
      taskId: s.taskId,
      answers: [choice(s.definition.questions[0]._id, "b", 1)],
    }),
    s.t.mutation(internal.courseQuizzes.close, {
      taskId: s.taskId,
      expectedDueAt: NOW + MINUTE,
    }),
  ]);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await s.recipient()).toMatchObject({
    submittedAt: NOW + MINUTE,
    submissionRevision: 1,
    submittedLate: false,
  });
  const grade = await s.student.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
  });
  expect(grade.published?.points).toBe(2);
  const history = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(history.page).toHaveLength(1);
  const review = await s.student.query(api.courseQuizzes.getReview, {
    taskId: s.taskId,
  });
  expect(review.answers[0].answer).toEqual({
    kind: "single_choice",
    optionId: "a",
  });
});

test("revoked teacher access blocks review retries and publication of an existing private draft", async () => {
  const s = await setup({ questions: [TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [textAnswer(s.definition.questions[0]._id)],
  });
  const args = {
    ...s.reviewArgs,
    scores: [{ questionId: s.definition.questions[0]._id, points: 4 }],
  };
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, args);
  await s.t.run((ctx) =>
    ctx.db.patch("classes", s.classId, { teacherId: s.users.outsider }),
  );
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, args),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.reviewArgs,
      expectedVersion: version,
      operationId: "after-revocation",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.query(api.courseQuizzes.getReview, {
      taskId: s.taskId,
      studentId: s.users.student,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toBeNull();
});

test.each([undefined, false])(
  "quizzes without shuffling preserve the original order (%s)",
  async (shuffleQuestions) => {
    const s = await setup({ shuffleQuestions, questions: [CHOICE, TEXT] });
    await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
    expect((await s.recipient())?.quizAttempt).not.toHaveProperty(
      "questionOrder",
    );
    expect(
      await s.student.query(api.courseQuizzes.getQuestions, {
        taskId: s.taskId,
      }),
    ).toEqual(
      s.definition.questions.map((question) => {
        if (question.kind !== "single_choice") return question;
        const { correctOptionId: _key, ...view } = question;
        return view;
      }),
    );
    await expect(
      s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        shuffleQuestions: true,
      }),
    ).rejects.toThrow("QUIZ_SHUFFLE_LOCKED");
    await s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      shuffleQuestions: false,
    });
  },
);

test("shuffling is a complete permutation at the maximum size and never mutates the definition", async () => {
  const s = await setup({ questions: Array.from({ length: 50 }, () => TEXT) });
  const questions = await s.t.run((ctx) =>
    ctx.db
      .query("courseQuizQuestions")
      .withIndex("by_taskId_and_order", (q) => q.eq("taskId", s.taskId))
      .take(50),
  );
  const original = questions.map((q) => q._id);
  const random = vi.spyOn(Math, "random").mockReturnValue(0);
  try {
    const order = shuffleQuizQuestions(questions);
    expect(order).toEqual([...original.slice(1), original[0]]);
    expect(new Set(order)).toEqual(new Set(original));
    expect(questions.map((q) => q._id)).toEqual(original);
    expect(shuffleQuizQuestions(questions.slice(0, 1))).toEqual(
      original.slice(0, 1),
    );
    expect(orderQuizQuestions(questions, order).map((q) => q._id)).toEqual(
      order,
    );
    for (const invalid of [[], [...order.slice(0, -1), order[0]]])
      expect(() => orderQuizQuestions(questions, invalid)).toThrow(
        "INVALID_QUIZ_QUESTION_ORDER",
      );
    expect(() =>
      orderQuizQuestions(questions.slice(1), original.slice(0, -1)),
    ).toThrow("INVALID_QUIZ_QUESTION_ORDER");
  } finally {
    random.mockRestore();
  }
});

test("each attempt retains its server order across reads, retries, saves, and closing changes", async () => {
  const s = await setup({
    shuffleQuestions: true,
    questions: [CHOICE, MULTIPLE, TEXT],
  });
  expect(
    await s.student.query(api.courseQuizzes.getQuestions, { taskId: s.taskId }),
  ).toEqual([]);
  const timing = await s.student.mutation(api.courseQuizzes.start, {
    taskId: s.taskId,
  });
  const attempt = (await s.recipient())!.quizAttempt!;
  const ids = s.definition.questions.map((q) => q._id);
  expect(attempt.questionOrder).toHaveLength(ids.length);
  expect(new Set(attempt.questionOrder)).toEqual(new Set(ids));
  expect(
    await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
  ).toEqual(timing);
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [textAnswer(ids[2])],
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + 2 * HOUR,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    title: "Renamed",
  });
  for (const client of [s.student, s.t.withIdentity({ subject: "student" })]) {
    const questions = await client.query(api.courseQuizzes.getQuestions, {
      taskId: s.taskId,
    });
    expect(questions.map((q) => q._id)).toEqual(attempt.questionOrder);
    for (const q of questions) {
      expect(q).not.toHaveProperty("correctOptionId");
      expect(q).not.toHaveProperty("correctOptionIds");
    }
    expect(
      (
        await client.query(api.courseQuizzes.get, {
          taskId: s.taskId,
          now: NOW,
        })
      ).questions,
    ).toEqual(questions);
  }
  await s.classmate.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  const other = (await s.recipient(s.users.classmate))!.quizAttempt!;
  expect(new Set(other.questionOrder)).toEqual(new Set(ids));
  expect(
    (
      await s.classmate.query(api.courseQuizzes.getQuestions, {
        taskId: s.taskId,
      })
    ).map((q) => q._id),
  ).toEqual(other.questionOrder);
  expect(
    (
      await s.teacher.query(api.courseQuizzes.getQuestions, {
        taskId: s.taskId,
      })
    ).map((q) => q._id),
  ).toEqual(ids);
  expect((await s.recipient())!.quizAttempt).toEqual(attempt);
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: s.taskId }))?.quiz
      ?.shuffleQuestions,
  ).toBe(true);
});

test("shuffle settings are editable only before the first attempt and never apply to file assignments", async () => {
  const s = await setup();
  for (const shuffleQuestions of [true, false, true]) {
    await s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      shuffleQuestions,
    });
    expect(
      (await s.teacher.query(api.courseTasks.get, { taskId: s.taskId }))?.quiz
        ?.shuffleQuestions,
    ).toBe(shuffleQuestions);
  }
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    durationMinutes: 20,
  });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      shuffleQuestions: false,
    }),
  ).rejects.toThrow("QUIZ_SHUFFLE_LOCKED");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    shuffleQuestions: true,
  });
  const fileId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "PDF",
    dueAt: NOW + HOUR,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: fileId,
      shuffleQuestions: false,
    }),
  ).rejects.toThrow("QUIZ_NOT_FOUND");
  expect(
    await s.teacher.query(api.courseTasks.get, { taskId: fileId }),
  ).not.toHaveProperty("quiz");
});

test("simultaneous starts share one order and setting changes racing the first start cannot slip through", async () => {
  const s = await setup({ shuffleQuestions: true, questions: [CHOICE, TEXT] });
  const starts = await Promise.all(
    [s.student, s.student].map((client) =>
      client.mutation(api.courseQuizzes.start, { taskId: s.taskId }),
    ),
  );
  expect(starts[0]).toEqual(starts[1]);
  const attempt = (await s.recipient())!.quizAttempt!;
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  expect((await s.recipient())!.quizAttempt).toEqual(attempt);
  const race = await setup({ questions: [CHOICE, TEXT] });
  const [setting, start] = await Promise.allSettled([
    race.teacher.mutation(api.courseTasks.update, {
      taskId: race.taskId,
      shuffleQuestions: true,
    }),
    race.student.mutation(api.courseQuizzes.start, { taskId: race.taskId }),
  ]);
  expect(start.status).toBe("fulfilled");
  const saved = (await race.recipient())!.quizAttempt!;
  if (setting.status === "fulfilled")
    expect(saved.questionOrder).toHaveLength(2);
  else {
    expect(setting.reason.message).toContain("QUIZ_SHUFFLE_LOCKED");
    expect(saved).not.toHaveProperty("questionOrder");
  }
});

test.each([false, true])(
  "shuffled presentation preserves grading, review retries and global key release (manual: %s)",
  async (manual) => {
    const s = await setup({
      shuffleQuestions: true,
      questions: manual ? [CHOICE, MULTIPLE, TEXT] : [CHOICE, MULTIPLE],
    });
    await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
    const ids = s.definition.questions.map((q) => q._id);
    const order = [...ids].reverse();
    await s.t.run(async (ctx) => {
      const recipient = await ctx.db
        .query("courseTaskRecipients")
        .withIndex("by_taskId_and_studentId", (q) =>
          q.eq("taskId", s.taskId).eq("studentId", s.users.student),
        )
        .unique();
      await ctx.db.patch("courseTaskRecipients", recipient!._id, {
        quizAttempt: { ...recipient!.quizAttempt!, questionOrder: order },
      });
    });
    const questions = await s.student.query(api.courseQuizzes.getQuestions, {
      taskId: s.taskId,
    });
    const answers = questions.map((q) =>
      q.kind === "text"
        ? textAnswer(q._id)
        : q.kind === "single_choice"
          ? choice(q._id)
          : multipleAnswer(q._id, ["dog", "cat"]),
    );
    await s.student.mutation(api.courseQuizzes.submit, {
      taskId: s.taskId,
      answers,
    });
    await expect(
      s.student.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
    ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
    const review = await s.teacher.query(api.courseQuizzes.getReview, {
      taskId: s.taskId,
      studentId: s.users.student,
    });
    expect(review.questions.map((q) => q._id)).toEqual(order);
    expect(review.answers.find((a) => a.questionId === ids[1])?.answer).toEqual(
      { kind: "multiple_choice", optionIds: ["dog", "cat"] },
    );
    if (manual) {
      const args = {
        ...s.reviewArgs,
        scores: [{ questionId: ids[2], points: 8 }],
      };
      const version = await s.teacher.mutation(
        api.courseQuizzes.saveReview,
        args,
      );
      expect(await s.teacher.mutation(api.courseQuizzes.saveReview, args)).toBe(
        version,
      );
      await s.teacher.mutation(api.courseTaskGrades.publish, {
        ...s.reviewArgs,
        expectedVersion: version,
        operationId: "publish-shuffled",
      });
    }
    const grade = await preparedGrade(s);
    expect(grade.published?.points).toBe(manual ? 12 : 4);
    expect(grade.published).not.toHaveProperty("quizScores");
    const storedGrade = await s.t.run((ctx) =>
      ctx.db
        .query("courseTaskGrades")
        .withIndex("by_taskId_and_studentId", (q) =>
          q.eq("taskId", s.taskId).eq("studentId", s.users.student),
        )
        .unique(),
    );
    expect(
      storedGrade?.published?.quizScores?.map((q) => q.questionId),
    ).toEqual(ids);
    vi.setSystemTime(NOW + HOUR);
    await s.t.mutation(internal.courseQuizzes.close, {
      taskId: s.taskId,
      expectedDueAt: NOW + HOUR,
    });
    const released = await s.student.query(api.courseQuizzes.getReview, {
      taskId: s.taskId,
    });
    expect(released.questions.map((q) => q._id)).toEqual(order);
    expect(released.questions.find((q) => q._id === ids[1])).toHaveProperty(
      "correctOptionIds",
      ["cat", "dog"],
    );
    expect((await s.recipient())!.quizAttempt!.questionOrder).toEqual(order);
  },
);

test("expiry retains the shuffled order and grades saved answers without an active browser", async () => {
  const s = await setup({
    shuffleQuestions: true,
    questions: [CHOICE, MULTIPLE],
  });
  const timing = await s.student.mutation(api.courseQuizzes.start, {
    taskId: s.taskId,
  });
  const attempt = (await s.recipient())!.quizAttempt!;
  await s.student.mutation(api.courseQuizzes.saveAnswers, {
    taskId: s.taskId,
    answers: [multipleAnswer(s.definition.questions[1]._id, ["cat", "dog"])],
  });
  vi.setSystemTime(timing.endsAt);
  await s.t.mutation(internal.courseQuizzes.expire, {
    recipientId: (await s.recipient())!._id,
  });
  expect((await s.recipient())!.quizAttempt!.questionOrder).toEqual(
    attempt.questionOrder,
  );
  expect((await preparedGrade(s)).published?.points).toBe(2);
});

test("question count is safe metadata before start, independent of weights and institutional scale", async () => {
  const s = await setup({ questions: [CHOICE, MULTIPLE, TEXT] });
  for (const reader of [s.teacher, s.student]) {
    const task = await reader.query(api.courseTasks.get, { taskId: s.taskId });
    expect(task?.quiz?.questionCount).toBe(3);
    expect(task?.grading?.maxPoints).toBe(12);
    expect(task?.grading?.scaleMax).toBe(100);
    expect(task).not.toHaveProperty("questions");
  }
  expect(
    await s.student.query(api.courseQuizzes.getQuestions, { taskId: s.taskId }),
  ).toEqual([]);
  await expect(
    s.outsider.query(api.courseTasks.get, { taskId: s.taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    title: "Updated title",
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: s.taskId }))?.quiz
      ?.questionCount,
  ).toBe(3);
});

test("existing quizzes calculate a safe question count without exposing content or migrating records", async () => {
  const s = await setup({ questions: [CHOICE, TEXT] });
  await s.t.run(async (ctx) => {
    const task = await ctx.db.get("courseTasks", s.taskId);
    await ctx.db.patch("courseTasks", s.taskId, {
      quiz: { ...task!.quiz!, questionCount: undefined },
    });
  });
  expect(
    (await s.student.query(api.courseTasks.get, { taskId: s.taskId }))?.quiz
      ?.questionCount,
  ).toBe(2);
  const stored = await s.t.run((ctx) => ctx.db.get("courseTasks", s.taskId));
  expect(stored?.quiz).not.toHaveProperty("questionCount");
  expect(
    await s.student.query(api.courseQuizzes.getQuestions, { taskId: s.taskId }),
  ).toEqual([]);
});

test("new quiz metadata does not read question bodies to display the count", async () => {
  const s = await setup({
    questions: Array.from({ length: 50 }, () => ({
      ...TEXT,
      prompt: "漢".repeat(10_000),
    })),
  });
  const result = await s.student.run(async (ctx) => {
    const task = await ctx.runQuery(api.courseTasks.get, { taskId: s.taskId });
    return { task, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(result.task?.quiz?.questionCount).toBe(50);
  expect(result.metrics.bytesRead.used).toBeLessThan(50_000);
});

test("all students receive automatic grades and answer keys together only after the server closes the current deadline", async () => {
  const s = await setup({ questions: [CHOICE] });
  for (const client of [s.student, s.classmate]) {
    await client.mutation(api.courseQuizzes.start, { taskId: s.taskId });
    await client.mutation(api.courseQuizzes.submit, {
      taskId: s.taskId,
      answers: [choice(s.definition.questions[0]._id)],
    });
  }
  await preparedGrade(s);
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + 2 * HOUR,
  });
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + HOUR,
  });
  for (const client of [s.student, s.classmate]) {
    expect(
      await client.query(api.courseTaskGrades.get, { taskId: s.taskId }),
    ).toMatchObject({ published: null, availableAt: NOW + 2 * HOUR });
    await expect(
      client.query(api.courseQuizzes.getReview, { taskId: s.taskId }),
    ).rejects.toThrow("QUIZ_REVIEW_LOCKED");
  }
  vi.setSystemTime(NOW + 2 * HOUR);
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toBeNull();
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + 2 * HOUR,
  });
  for (const client of [s.student, s.classmate]) {
    const grade = await client.query(api.courseTaskGrades.get, {
      taskId: s.taskId,
    });
    expect(grade.published).toMatchObject({
      points: 2,
      updatedAt: NOW + 2 * HOUR,
    });
    expect(grade.availableAt).toBeUndefined();
    expect(
      (await client.query(api.courseQuizzes.getReview, { taskId: s.taskId }))
        .questions[0],
    ).toHaveProperty("correctOptionId", "a");
    await expect(
      client.query(api.courseTaskGrades.history, {
        taskId: s.taskId,
        studentId: s.users.student,
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
});

test("one review request saves and confirms a grade atomically, with retry safety and release at closure", async () => {
  const s = await setup({ questions: [TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [textAnswer(s.definition.questions[0]._id)],
  });
  const args = {
    ...s.reviewArgs,
    publish: true,
    scores: [{ questionId: s.definition.questions[0]._id, points: 6 }],
    comment: "Good work",
  };
  const version = await s.teacher.mutation(api.courseQuizzes.saveReview, args);
  expect(await s.teacher.mutation(api.courseQuizzes.saveReview, args)).toBe(
    version,
  );
  const prepared = await preparedGrade(s);
  expect(prepared.draft).toBeNull();
  expect(prepared.published).toMatchObject({ points: 6, comment: "Good work" });
  expect(prepared.availableAt).toBe(NOW + HOUR);
  let history = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(history.page).toHaveLength(1);
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...args,
      comment: "different",
    }),
  ).rejects.toThrow("INVALID_GRADE_REQUEST");
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseQuizzes.close, {
    taskId: s.taskId,
    expectedDueAt: NOW + HOUR,
  });
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toMatchObject({ points: 6, comment: "Good work" });
  await s.teacher.mutation(api.courseQuizzes.saveReview, {
    ...args,
    expectedVersion: version,
    operationId: "after-close",
    scores: [{ questionId: s.definition.questions[0]._id, points: 7 }],
  });
  expect(
    (await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }))
      .published,
  ).toMatchObject({ points: 7 });
  history = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(history.page).toHaveLength(2);
});

test("a one-click publication rejects partial reviews and stale context without leaving partial writes", async () => {
  const s = await setup({ questions: [TEXT] });
  await s.student.mutation(api.courseQuizzes.start, { taskId: s.taskId });
  await s.student.mutation(api.courseQuizzes.submit, {
    taskId: s.taskId,
    answers: [textAnswer(s.definition.questions[0]._id)],
  });
  const args = {
    ...s.reviewArgs,
    publish: true,
    scores: [{ questionId: s.definition.questions[0]._id, points: null }],
  };
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, args),
  ).rejects.toThrow("QUIZ_REVIEW_INCOMPLETE");
  expect(
    (
      await s.teacher.query(api.courseTaskGrades.get, {
        taskId: s.taskId,
        studentId: s.users.student,
      })
    ).version,
  ).toBe(0);
  const complete = {
    ...args,
    scores: [{ questionId: s.definition.questions[0]._id, points: 8 }],
  };
  await expect(
    s.student.mutation(api.courseQuizzes.saveReview, complete),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...complete,
      expectedVersion: 1,
    }),
  ).rejects.toThrow("GRADE_CHANGED");
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...complete,
      expectedSubmissionRevision: 0,
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CHANGED");
  await expect(
    s.teacher.mutation(api.courseQuizzes.saveReview, {
      ...complete,
      expectedGrading: { ...complete.expectedGrading, scaleMax: 5 },
    }),
  ).rejects.toThrow("TASK_GRADING_CHANGED");
  const history = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(history.page).toHaveLength(0);
});
