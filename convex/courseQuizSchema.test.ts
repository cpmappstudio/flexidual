import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "quiz-schema",
      firstName: "Quiz",
      lastName: "Schema",
      fullName: "Quiz Schema",
      isActive: true,
      createdAt: 1,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Quiz schema",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    const classId = await ctx.db.insert("classes", {
      curriculumId,
      name: "Quiz schema",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    const taskId = await ctx.db.insert("courseTasks", {
      classId,
      createdBy: userId,
      title: "Legacy assignment",
      allowLateSubmissions: false,
      updatedAt: 1,
    });
    const recipientId = await ctx.db.insert("courseTaskRecipients", {
      taskId,
      studentId: userId,
      assignedAt: 1,
      submissionRevision: 0,
    });
    return { userId, classId, taskId, recipientId };
  });
  return { t, ...ids };
}

test("legacy activities and recipients coexist with quiz configuration and fixed individual limits", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    expect(await ctx.db.get("courseTasks", s.taskId)).not.toHaveProperty(
      "kind",
    );
    expect(
      await ctx.db.get("courseTaskRecipients", s.recipientId),
    ).not.toHaveProperty("quizAttempt");
    await ctx.db.patch("courseTasks", s.taskId, {
      kind: "quiz",
      quiz: { durationMinutes: 30, firstStartedAt: 10 },
      dueAt: 1_000,
    });
    await ctx.db.patch("courseTaskRecipients", s.recipientId, {
      quizAttempt: { startedAt: 10, timeLimitAt: 1_800_010 },
    });
    await ctx.db.patch("courseTasks", s.taskId, { dueAt: 2_000 });
    expect(
      await ctx.db.get("courseTaskRecipients", s.recipientId),
    ).toMatchObject({
      submissionRevision: 0,
      quizAttempt: { startedAt: 10, timeLimitAt: 1_800_010 },
    });
  });
});

test("question variants require a choice key only for selection and retain indexed order", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const fields = { taskId: s.taskId, prompt: "Question", maxPoints: 2 };
    await ctx.db.insert("courseQuizQuestions", {
      ...fields,
      order: 2,
      kind: "text",
    });
    await ctx.db.insert("courseQuizQuestions", {
      ...fields,
      order: 1,
      kind: "single_choice",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      correctOptionId: "b",
    });
    const questions = await ctx.db
      .query("courseQuizQuestions")
      .withIndex("by_taskId_and_order", (q) => q.eq("taskId", s.taskId))
      .take(50);
    expect(questions.map(({ kind }) => kind)).toEqual([
      "single_choice",
      "text",
    ]);
    await expect(
      ctx.db.insert("courseQuizQuestions", {
        ...fields,
        order: 3,
        kind: "single_choice",
        options: [],
      } as never),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert("courseQuizQuestions", {
        ...fields,
        order: 3,
        kind: "text",
        correctOptionId: "b",
      } as never),
    ).rejects.toThrow();
  });
});

test("answers preserve their version and reject mixed answer shapes or foreign table IDs", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const questionId = await ctx.db.insert("courseQuizQuestions", {
      taskId: s.taskId,
      order: 0,
      prompt: "Explain",
      maxPoints: 5,
      kind: "text",
    });
    const fields = {
      taskId: s.taskId,
      recipientId: s.recipientId,
      questionId,
      version: 1,
      updatedAt: 10,
    };
    const answerId = await ctx.db.insert("courseQuizAnswers", {
      ...fields,
      answer: { kind: "text", text: "My response" },
    });
    const answer = await ctx.db
      .query("courseQuizAnswers")
      .withIndex("by_taskId_and_recipientId_and_questionId", (q) =>
        q
          .eq("taskId", s.taskId)
          .eq("recipientId", s.recipientId)
          .eq("questionId", questionId),
      )
      .unique();
    expect(answer).toMatchObject({ _id: answerId, version: 1 });
    await expect(
      ctx.db.insert("courseQuizAnswers", {
        ...fields,
        answer: { kind: "text", optionId: "a" },
      } as never),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert("courseQuizAnswers", {
        ...fields,
        questionId: s.taskId,
        answer: { kind: "text", text: "Invalid" },
      } as never),
    ).rejects.toThrow();
  });
});

test("manual grades keep their required author and automatic publications have an explicit system origin", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const questionId = await ctx.db.insert("courseQuizQuestions", {
      taskId: s.taskId,
      order: 0,
      prompt: "Question",
      maxPoints: 5,
      kind: "single_choice",
      options: [{ id: "a", label: "A" }],
      correctOptionId: "a",
    });
    const fields = {
      taskId: s.taskId,
      classId: s.classId,
      studentId: s.userId,
      recipientId: s.recipientId,
      version: 1,
      lastOperationId: "publish",
      lastOperationBy: s.userId,
      lastOperationKind: "publish" as const,
    };
    const result = { points: 5, submissionRevision: 1, updatedAt: 20 };
    await expect(
      ctx.db.insert("courseTaskGrades", {
        ...fields,
        published: result,
      } as never),
    ).rejects.toThrow();
    const automatic = {
      ...result,
      source: "automatic" as const,
      quizScores: [{ questionId, points: 5 }],
    };
    const gradeId = await ctx.db.insert("courseTaskGrades", {
      ...fields,
      lastOperationBy: null,
      published: automatic,
    });
    const historyId = await ctx.db.insert("courseTaskGradeHistory", {
      gradeId,
      version: 1,
      ...automatic,
    });
    expect(await ctx.db.get("courseTaskGradeHistory", historyId)).toMatchObject(
      automatic,
    );
    await expect(
      ctx.db.insert("courseTaskGrades", {
        ...fields,
        published: { ...automatic, authorId: s.userId },
      } as never),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert("courseTaskGrades", {
        ...fields,
        published: { ...automatic, quizScores: [{ questionId, points: null }] },
      } as never),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert("courseTaskGrades", {
        ...fields,
        draft: automatic,
      } as never),
    ).rejects.toThrow();
  });
});
