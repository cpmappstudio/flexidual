import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { ensureCourseTaskRecipient } from "./model/courseTaskRecipients";
import {
  DEFAULT_GRADING_POLICY,
  gradeOutcome,
  gradeToScale,
} from "../lib/grading";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const users = {} as Record<
      | "admin"
      | "principal"
      | "teacher"
      | "gradeTeacher"
      | "student"
      | "classmate"
      | "tutor"
      | "outsider",
      Id<"users">
    >;
    for (const role of [
      "admin",
      "principal",
      "teacher",
      "gradeTeacher",
      "student",
      "classmate",
      "tutor",
      "outsider",
    ] as const) {
      users[role] = await ctx.db.insert("users", {
        clerkId: role,
        firstName: role,
        lastName: "Test",
        fullName: role,
        isActive: true,
        createdAt: Date.now(),
      });
    }
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: users.admin,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdAt: Date.now(),
      createdBy: users.admin,
    });
    for (const [userId, role, orgType, orgId] of [
      [users.admin, "admin", "school", schoolId],
      [users.principal, "principal", "campus", campusId],
    ] as const)
      await ctx.db.insert("roleAssignments", {
        userId,
        role,
        orgType,
        orgId,
        schoolId,
        assignedAt: Date.now(),
      });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdAt: Date.now(),
      createdBy: users.admin,
    });
    const classId = await ctx.db.insert("classes", {
      schoolId,
      campusId,
      curriculumId,
      teacherId: users.teacher,
      tutorId: users.tutor,
      gradeAssignments: [{ gradeCode: "05", teacherId: users.gradeTeacher }],
      name: "Math",
      isActive: true,
      enrollmentsMigratedAt: Date.now(),
      endDate: Date.now() + 86_400_000,
      createdAt: Date.now(),
      createdBy: users.admin,
    });
    for (const studentId of [users.student, users.classmate])
      await ctx.db.insert("classEnrollments", {
        classId,
        studentId,
        enrolledAt: Date.now(),
        enrolledBy: users.admin,
      });
    const taskId = await ctx.db.insert("courseTasks", {
      classId,
      createdBy: users.teacher,
      title: "Fractions",
      releasedAt: Date.now(),
      allowLateSubmissions: true,
      updatedAt: Date.now(),
      grading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 },
    });
    await ensureCourseTaskRecipient(ctx, taskId, users.student);
    await ensureCourseTaskRecipient(ctx, taskId, users.classmate);
    return { users, schoolId, campusId, curriculumId, classId, taskId };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const student = t.withIdentity({ subject: "student" });
  const admin = t.withIdentity({ subject: "admin" });
  const args = {
    taskId: ids.taskId,
    studentId: ids.users.student,
    expectedVersion: 0,
    expectedSubmissionRevision: 0,
    operationId: "save-1",
    expectedGrading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 },
  };
  return { t, ...ids, teacher, student, admin, args };
}

test("quiz metadata remains readable and general grade APIs never expose stored per-question scores", async () => {
  const s = await setup();
  const grading = { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 };
  await s.t.run(async (ctx) => {
    await ctx.db.patch("courseTasks", s.taskId, {
      kind: "quiz",
      quiz: { durationMinutes: 30 },
      dueAt: Date.now() + 60_000,
      allowLateSubmissions: false,
    });
    const recipient = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", s.taskId).eq("studentId", s.users.student),
      )
      .unique();
    const questionId = await ctx.db.insert("courseQuizQuestions", {
      taskId: s.taskId,
      order: 0,
      prompt: "Choose",
      maxPoints: 20,
      kind: "single_choice",
      options: [{ id: "a", label: "A" }],
      correctOptionId: "a",
    });
    const published = {
      points: 20,
      source: "automatic" as const,
      submissionRevision: 0,
      updatedAt: Date.now(),
      quizScores: [{ questionId, points: 20 }],
    };
    const gradeId = await ctx.db.insert("courseTaskGrades", {
      taskId: s.taskId,
      classId: s.classId,
      studentId: s.users.student,
      recipientId: recipient!._id,
      version: 1,
      lastOperationId: "automatic",
      lastOperationBy: null,
      lastOperationKind: "publish",
      published,
      draft: {
        points: 0,
        submissionRevision: 0,
        updatedAt: Date.now(),
        authorId: s.users.teacher,
        quizScores: [{ questionId, points: null }],
      },
    });
    await ctx.db.insert("courseTaskGradeHistory", {
      gradeId,
      version: 1,
      ...published,
    });
  });
  expect(
    await s.student.query(api.courseTasks.get, { taskId: s.taskId }),
  ).toMatchObject({
    kind: "quiz",
    quiz: { durationMinutes: 30 },
    grading,
  });
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({
    published: null,
    draft: null,
    version: 0,
    needsReview: false,
  });
  const studentGrade = await s.teacher.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
    studentId: s.users.student,
  });
  expect(studentGrade.published).toMatchObject({
    points: 20,
    source: "automatic",
  });
  expect(studentGrade.published).not.toHaveProperty("quizScores");
  expect(studentGrade.published).not.toHaveProperty("authorId");
  const history = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(history.page).toHaveLength(1);
  expect(history.page[0]).toMatchObject({
    version: 1,
    points: 20,
    source: "automatic",
  });
  expect(history.page[0]).not.toHaveProperty("quizScores");
  expect(history.page[0]).not.toHaveProperty("gradeId");
});

test("school reads keep the same contract and access after setting a grading policy", async () => {
  const { t, admin, schoolId } = await setup();
  const schoolArgs = { id: schoolId };
  const school = await admin.query(api.schools.get, schoolArgs);
  expect(school).toMatchObject({ _id: schoolId, name: "School" });

  const policy = { ...DEFAULT_GRADING_POLICY, passingPercentage: 70 };
  await admin.mutation(api.academicSettings.updateGradingPolicy, {
    schoolId,
    policy,
  });

  expect(await admin.query(api.schools.list, { isActive: true })).toEqual([
    school,
  ]);
  expect(await admin.query(api.schools.list, {})).toEqual([school]);
  expect(await admin.query(api.schools.get, schoolArgs)).toEqual(school);
  expect(
    await admin.query(api.academicSettings.getGradingPolicy, { schoolId }),
  ).toEqual(policy);

  const outsider = t.withIdentity({ subject: "outsider" });
  expect(await outsider.query(api.schools.list, { isActive: true })).toEqual(
    [],
  );
  await expect(outsider.query(api.schools.get, schoolArgs)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
});

test.each([0, 1, 2])(
  "server configuration rejects sub-unit maxima at precision %s and still publishes a real zero",
  async (decimalPlaces) => {
    const s = await setup();
    const policy = { ...DEFAULT_GRADING_POLICY, decimalPlaces };
    await s.admin.mutation(api.academicSettings.updateGradingPolicy, {
      schoolId: s.schoolId,
      policy,
    });
    for (const field of ["scaleMax", "defaultMaxPoints"] as const)
      await expect(
        s.admin.mutation(api.academicSettings.updateGradingPolicy, {
          schoolId: s.schoolId,
          policy: { ...policy, [field]: 1e-10 },
        }),
      ).rejects.toThrow("INVALID_GRADING_POLICY");
    await expect(
      s.teacher.mutation(api.courseTasks.create, {
        classId: s.classId,
        title: "Unrepresentable maximum",
        grading: { maxPoints: 1e-10 },
      }),
    ).rejects.toThrow("INVALID_TASK_GRADING");
    await expect(
      s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        grading: { maxPoints: 1e-10 },
      }),
    ).rejects.toThrow("INVALID_TASK_GRADING");
    await expect(
      s.teacher.mutation(api.courseQuizzes.create, {
        classId: s.classId,
        title: "Unrepresentable quiz",
        dueAt: Date.now() + 60_000,
        durationMinutes: 1,
        questions: [{ kind: "text", prompt: "Explain", maxPoints: 1e-10 }],
      }),
    ).rejects.toThrow("INVALID_QUIZ_QUESTIONS");
    expect(
      await s.admin.query(api.academicSettings.getGradingPolicy, {
        schoolId: s.schoolId,
      }),
    ).toEqual(policy);
    expect(
      await s.t.run((ctx) => ctx.db.query("courseTasks").collect()),
    ).toHaveLength(1);
    const taskId = await s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Smallest valid maximum",
      grading: { maxPoints: 10 ** -decimalPlaces },
    });
    await s.t.run((ctx) =>
      ensureCourseTaskRecipient(ctx, taskId, s.users.student),
    );
    const task = (await s.t.run((ctx) => ctx.db.get("courseTasks", taskId)))!;
    const args = { ...s.args, taskId, expectedGrading: task.grading! };
    await expect(
      s.teacher.mutation(api.courseTaskGrades.saveDraft, {
        ...args,
        points: 1e-10,
      }),
    ).rejects.toThrow("INVALID_TASK_GRADE");
    await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...args,
      points: 0,
    });
    await s.teacher.mutation(api.courseTaskGrades.publish, {
      ...args,
      expectedVersion: 1,
      operationId: "publish-valid-zero",
    });
    const view = await s.student.query(api.courseTaskGrades.get, { taskId });
    expect(view.published?.points).toBe(0);
    expect(gradeToScale(view.published!.points, view.grading!)).toBe(0);
  },
);

test("a historical sub-unit grading snapshot can still publish and display zero without rewriting its configuration", async () => {
  const s = await setup();
  const grading = { ...s.args.expectedGrading, maxPoints: 1e-10 };
  // Simulate a snapshot persisted before positive-unit validation.
  await s.t.run((ctx) => ctx.db.patch("courseTasks", s.taskId, { grading }));
  const args = { ...s.args, expectedGrading: grading };
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...args,
    points: 0,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...args,
    expectedVersion: 1,
    operationId: "publish-historical-zero",
  });
  const view = await s.student.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
  });
  expect(view.grading).toEqual(grading);
  expect(view.published?.points).toBe(0);
  expect(gradeToScale(view.published!.points, view.grading!)).toBe(0);
  expect(
    (await s.t.run((ctx) => ctx.db.get("courseTasks", s.taskId)))?.grading,
  ).toEqual(grading);
});

test("drafts remain private; publication and correction preserve previous published results and history", async () => {
  const s = await setup();
  expect(
    await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      points: 0,
      comment: "Needs work",
    }),
  ).toBe(1);
  const own = await s.student.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
  });
  expect(own).toMatchObject({ version: 0, draft: null, published: null });
  expect(
    await s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.args,
      expectedVersion: 1,
      operationId: "publish-1",
    }),
  ).toBe(2);
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({ published: { points: 0 }, draft: null });
  await expect(
    s.student.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      institutionalPoints: 85.17,
      expectedVersion: 2,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      institutionalPoints: 100.01,
      expectedVersion: 2,
    }),
  ).rejects.toThrow("INVALID_TASK_GRADE");
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    expectedVersion: 2,
    operationId: "save-2",
    institutionalPoints: 85.17,
  });
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({ published: { points: 0 }, draft: null });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 3,
    operationId: "publish-2",
  });
  const history = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(history.page).toHaveLength(1);
  expect(history.page[0]).toMatchObject({
    points: expect.closeTo(17.034, 10),
    institutionalPoints: 85.17,
    version: 4,
  });
  const updated = await s.student.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
  });
  expect(updated).toMatchObject({
    published: {
      points: expect.closeTo(17.034, 10),
      institutionalPoints: 85.17,
    },
    draft: null,
  });
  // An earlier tab ignores the new field and normalizes activity points itself.
  expect(gradeToScale(updated.published!.points, updated.grading!)).toBe(85.17);
  expect(history.isDone).toBe(false);
  const next = await s.teacher.query(api.courseTaskGrades.history, {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: history.continueCursor, numItems: 1 },
  });
  expect(next.page[0]).toMatchObject({ points: 0, version: 2 });
  expect(next.page[0].institutionalPoints).toBeUndefined();
});

test("bulk publishing covers all saved drafts in batches and preserves stale and later edits", async () => {
  const s = await setup();
  const queryArgs = { taskId: s.taskId };
  const publishArgs = { ...queryArgs, operationId: "bulk-publish" };
  expect(
    await s.teacher.query(api.courseTaskGrades.hasPublishableDrafts, queryArgs),
  ).toBe(false);
  await expect(
    s.student.query(api.courseTaskGrades.hasPublishableDrafts, queryArgs),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.mutation(api.courseTaskGrades.publishAll, publishArgs),
  ).rejects.toThrow("PERMISSION_DENIED");

  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 10,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    operationId: "publish-old",
  });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    expectedVersion: 2,
    operationId: "draft-stale",
    points: 12,
  });
  await s.t.run(async (ctx) => {
    const studentGrade = await ctx.db
      .query("courseTaskGrades")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", s.taskId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.patch("courseTaskRecipients", studentGrade!.recipientId, {
      submissionRevision: 1,
    });
  });
  expect(
    await s.teacher.query(api.courseTaskGrades.hasPublishableDrafts, queryArgs),
  ).toBe(false);

  const [laterGradeId] = await s.t.run(async (ctx) => {
    const ids: Id<"courseTaskGrades">[] = [];
    for (let i = 0; i < 52; i++) {
      const studentId = await ctx.db.insert("users", {
        clerkId: `bulk-${i}`,
        firstName: "Bulk",
        lastName: String(i),
        fullName: `Bulk ${i}`,
        isActive: true,
        createdAt: 1,
      });
      const recipientId = await ctx.db.insert("courseTaskRecipients", {
        taskId: s.taskId,
        classId: s.classId,
        studentId,
        submissionRevision: 0,
        assignedAt: 1,
      });
      ids.push(
        await ctx.db.insert("courseTaskGrades", {
          ...queryArgs,
          classId: s.classId,
          studentId,
          recipientId,
          version: 1,
          draft: {
            points: i,
            institutionalScale: true,
            submissionRevision: 0,
            updatedAt: i + 1,
            authorId: s.users.teacher,
          },
          lastOperationId: `draft-${i}`,
          lastOperationKind: "draft",
          lastOperationBy: s.users.teacher,
        }),
      );
    }
    return ids.slice(-1);
  });
  expect(
    await s.teacher.query(api.courseTaskGrades.hasPublishableDrafts, queryArgs),
  ).toBe(true);
  const first = await s.teacher.mutation(
    api.courseTaskGrades.publishAll,
    publishArgs,
  );
  expect(first).toMatchObject({ published: 50, skipped: 0 });
  expect(first.continuation).not.toBeNull();
  await s.t.run(async (ctx) => {
    const later = await ctx.db.get("courseTaskGrades", laterGradeId);
    await ctx.db.patch("courseTaskGrades", laterGradeId, {
      draft: { ...later!.draft!, updatedAt: first.continuation!.before + 1 },
    });
  });
  const last = await s.teacher.mutation(api.courseTaskGrades.publishAll, {
    ...publishArgs,
    continuation: first.continuation!,
  });
  expect(last).toEqual({ published: 1, skipped: 1, continuation: null });
  expect(
    await s.student.query(api.courseTaskGrades.get, queryArgs),
  ).toMatchObject({
    draft: null,
    published: { points: 10 },
    needsReview: true,
  });
  const grades = await s.t.run(async (ctx) => ({
    later: await ctx.db.get("courseTaskGrades", laterGradeId),
    history: await ctx.db.query("courseTaskGradeHistory").collect(),
  }));
  expect(grades.later?.published).toBeUndefined();
  expect(grades.later?.draft?.points).toBe(51);
  expect(grades.history).toHaveLength(52);
});

test("neither publication path can expose an invalid stored draft", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    institutionalPoints: 85,
  });
  await s.t.run(async (ctx) => {
    const grade = await ctx.db
      .query("courseTaskGrades")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", s.taskId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.patch("courseTaskGrades", grade!._id, {
      draft: { ...grade!.draft!, points: 101 },
    });
  });
  const task = { taskId: s.taskId };
  expect(
    await s.teacher.query(api.courseTaskGrades.hasPublishableDrafts, task),
  ).toBe(false);
  await expect(
    s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.args,
      expectedVersion: 1,
      operationId: "publish-invalid",
    }),
  ).rejects.toThrow("INVALID_TASK_GRADE");
  expect(
    await s.teacher.mutation(api.courseTaskGrades.publishAll, {
      ...task,
      operationId: "bulk-invalid",
    }),
  ).toEqual({ published: 0, skipped: 1, continuation: null });
  expect(await s.student.query(api.courseTaskGrades.get, task)).toMatchObject({
    draft: null,
    published: null,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskGradeHistory").collect()),
  ).toHaveLength(0);
});

test("an older client can keep the exact institutional score in a private comment edit", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    institutionalPoints: 85.17,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    operationId: "publish-1",
  });
  const target = { taskId: s.taskId, studentId: s.users.student };
  const before = await s.teacher.query(api.courseTaskGrades.get, target);
  const edit = {
    ...s.args,
    expectedVersion: 2,
    operationId: "legacy-comment",
    points: before.published!.points,
    comment: "Private correction",
  };
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...edit,
      institutionalPoints: 85.17,
    }),
  ).rejects.toThrow("INVALID_TASK_GRADE");
  expect(await s.teacher.mutation(api.courseTaskGrades.saveDraft, edit)).toBe(
    3,
  );
  expect(await s.teacher.mutation(api.courseTaskGrades.saveDraft, edit)).toBe(
    3,
  );
  const teacher = await s.teacher.query(api.courseTaskGrades.get, target);
  expect(teacher.draft).toMatchObject({
    points: before.published!.points,
    institutionalPoints: 85.17,
    comment: "Private correction",
  });
  const student = await s.student.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
  });
  expect(student.draft).toBeNull();
  expect(student.published).toEqual(before.published);
});

test("only task managers receive inline draft grades on the current submissions page", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    institutionalPoints: 82.5,
  });
  const args = {
    taskId: s.taskId,
    paginationOpts: { cursor: null, numItems: 20 },
  };
  const page = await s.teacher.query(
    api.courseTaskSubmissions.listForTask,
    args,
  );
  expect(
    page.page.find((row) => row.studentId === s.users.student)?.grade,
  ).toMatchObject({
    version: 1,
    draft: { institutionalPoints: 82.5 },
    published: null,
  });
  await expect(
    s.student.query(api.courseTaskSubmissions.listForTask, args),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("saving and publishing retries are idempotent and stale teachers cannot overwrite a winner", async () => {
  const s = await setup();
  const request = { ...s.args, points: 12 };
  const saves = await Promise.all([
    s.teacher.mutation(api.courseTaskGrades.saveDraft, request),
    s.teacher.mutation(api.courseTaskGrades.saveDraft, request),
  ]);
  expect(saves).toEqual([1, 1]);
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      points: 13,
      operationId: "other",
    }),
  ).rejects.toThrow("GRADE_CHANGED");
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...request,
      points: 13,
    }),
  ).rejects.toThrow("INVALID_GRADE_REQUEST");
  const publish = { ...s.args, expectedVersion: 1, operationId: "publish" };
  expect(
    await Promise.all([
      s.teacher.mutation(api.courseTaskGrades.publish, publish),
      s.teacher.mutation(api.courseTaskGrades.publish, publish),
    ]),
  ).toEqual([2, 2]);
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskGradeHistory").collect()),
  ).toHaveLength(1);
  expect(
    await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      expectedVersion: 2,
      operationId: "unchanged",
      points: 12,
    }),
  ).toBe(2);
});

test("new submission revisions preserve published results but reject old draft publication", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 15,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    operationId: "pub",
  });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    expectedVersion: 2,
    operationId: "draft-2",
    points: 16,
  });
  await s.t.run(async (ctx) => {
    const recipient = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", s.taskId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.patch("courseTaskRecipients", recipient!._id, {
      submissionRevision: 1,
      submittedAt: Date.now(),
    });
  });
  await expect(
    s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.args,
      expectedVersion: 3,
      operationId: "pub-stale",
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CHANGED");
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({ needsReview: true, published: { points: 15 } });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    expectedVersion: 3,
    expectedSubmissionRevision: 1,
    operationId: "new",
    points: 19,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 4,
    expectedSubmissionRevision: 1,
    operationId: "pub-new",
  });
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({
    needsReview: false,
    published: { points: 19, submissionRevision: 1 },
  });
});

test("permissions apply to every read, write, history and retry without requiring an uploaded file", async () => {
  const s = await setup();
  for (const subject of ["student", "classmate", "outsider", "tutor"]) {
    const client = s.t.withIdentity({ subject });
    await expect(
      client.mutation(api.courseTaskGrades.saveDraft, { ...s.args, points: 8 }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
  await expect(
    s.student.query(api.courseTaskGrades.get, {
      taskId: s.taskId,
      studentId: s.users.classmate,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.query(api.courseTaskGrades.history, {
      taskId: s.taskId,
      studentId: s.users.student,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.t.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).rejects.toThrow();
  for (const subject of ["gradeTeacher", "principal", "admin"]) {
    const client = s.t.withIdentity({ subject });
    expect(
      await client.query(api.courseTaskGrades.get, {
        taskId: s.taskId,
        studentId: s.users.student,
      }),
    ).toMatchObject({ version: 0 });
  }
  await s.t
    .withIdentity({ subject: "gradeTeacher" })
    .mutation(api.courseTaskGrades.saveDraft, { ...s.args, points: 10 });
  await s.t.run((ctx) =>
    ctx.db.patch("classes", s.classId, { gradeAssignments: undefined }),
  );
  await expect(
    s.t
      .withIdentity({ subject: "gradeTeacher" })
      .mutation(api.courseTaskGrades.saveDraft, { ...s.args, points: 10 }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.delete("classEnrollments", enrollment!._id);
  });
  await expect(
    s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("institution policy is admin-only, snapshots are stable, and existing tasks stay ungraded", async () => {
  const s = await setup();
  const policy = { scaleMax: 10, decimalPlaces: 1, defaultMaxPoints: 50 };
  await expect(
    s.teacher.mutation(api.academicSettings.updateGradingPolicy, {
      schoolId: s.schoolId,
      policy,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.t
      .withIdentity({ subject: "principal" })
      .mutation(api.academicSettings.updateGradingPolicy, {
        schoolId: s.schoolId,
        policy,
      }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.admin.mutation(api.academicSettings.updateGradingPolicy, {
    schoolId: s.schoolId,
    policy,
  });
  expect(
    await s.teacher.query(api.academicSettings.getGradingForCourse, {
      classId: s.classId,
    }),
  ).toEqual(policy);
  const oldId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "No grading",
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: oldId }))?.grading,
  ).toBeUndefined();
  const id = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Graded",
    grading: { maxPoints: 30 },
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: id }))?.grading,
  ).toEqual({ scaleMax: 10, decimalPlaces: 1, maxPoints: 30 });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 18,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    grading: { maxPoints: 20 },
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: s.taskId }))?.grading,
  ).toEqual({ scaleMax: 100, decimalPlaces: 2, maxPoints: 20 });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      grading: { maxPoints: 30 },
    }),
  ).rejects.toThrow("TASK_GRADING_LOCKED");
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      grading: null,
    }),
  ).rejects.toThrow("TASK_GRADING_LOCKED");
});

test("a school admin can edit grading from their campus without changing who may write", async () => {
  const s = await setup();
  const otherSchoolId = await s.t.run(async (ctx) => {
    const fields = {
      isActive: true,
      createdAt: Date.now(),
      createdBy: s.users.outsider,
    };
    const schoolId = await ctx.db.insert("schools", {
      ...fields,
      name: "Other School",
      slug: "other-school",
    });
    await ctx.db.insert("campuses", {
      ...fields,
      schoolId,
      name: "Other Campus",
      slug: "other-campus",
    });
    return schoolId;
  });
  const context = { orgSlug: "campus" };
  const policy = { ...DEFAULT_GRADING_POLICY, passingPercentage: 70 };
  const campusContext = await s.admin.query(
    api.organizations.getSettingsContext,
    context,
  );
  expect(campusContext).toMatchObject({
    institution: { _id: s.schoolId },
    canViewInstitutionSettings: true,
    canManageInstitution: true,
  });
  expect(
    await s.admin.query(api.organizations.getSettingsContext, {
      orgSlug: "school",
    }),
  ).toEqual(campusContext);
  expect(
    await s.admin.query(api.academicSettings.getGradingPolicy, {
      schoolId: s.schoolId,
    }),
  ).toEqual(DEFAULT_GRADING_POLICY);
  await s.admin.mutation(api.academicSettings.updateGradingPolicy, {
    schoolId: s.schoolId,
    policy,
  });
  const principal = s.t.withIdentity({ subject: "principal" });
  expect(
    await principal.query(api.organizations.getSettingsContext, context),
  ).toMatchObject({
    canViewInstitutionSettings: true,
    canManageInstitution: false,
  });
  expect(
    await principal.query(api.academicSettings.getGradingPolicy, {
      schoolId: s.schoolId,
    }),
  ).toEqual(policy);
  await expect(
    s.teacher.query(api.academicSettings.getGradingPolicy, {
      schoolId: s.schoolId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.admin.query(api.academicSettings.getGradingPolicy, {
      schoolId: otherSchoolId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    principal.mutation(api.academicSettings.updateGradingPolicy, {
      schoolId: s.schoolId,
      policy: DEFAULT_GRADING_POLICY,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await s.admin.query(api.organizations.getSettingsContext, {
      orgSlug: "other-campus",
    }),
  ).toBeNull();
  await expect(
    s.admin.mutation(api.academicSettings.updateGradingPolicy, {
      schoolId: otherSchoolId,
      policy,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("range, decimals and finite validation reject invalid values without creating records", async () => {
  const s = await setup();
  for (const points of [-1, 20.01, 1.001, Infinity, NaN]) {
    await expect(
      s.teacher.mutation(api.courseTaskGrades.saveDraft, { ...s.args, points }),
    ).rejects.toThrow("INVALID_TASK_GRADE");
  }
  for (const policy of [
    { scaleMax: 0, decimalPlaces: 2, defaultMaxPoints: 100 },
    { scaleMax: 100, decimalPlaces: 3, defaultMaxPoints: 100 },
    { scaleMax: 100, decimalPlaces: 0, defaultMaxPoints: 1.5 },
    { scaleMax: Infinity, decimalPlaces: 2, defaultMaxPoints: 100 },
    { ...DEFAULT_GRADING_POLICY, passingPercentage: -1 },
    { ...DEFAULT_GRADING_POLICY, passingPercentage: 100.01 },
    { ...DEFAULT_GRADING_POLICY, passingPercentage: NaN },
  ])
    await expect(
      s.admin.mutation(api.academicSettings.updateGradingPolicy, {
        schoolId: s.schoolId,
        policy,
      }),
    ).rejects.toThrow("INVALID_GRADING_POLICY");
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskGrades").collect()),
  ).toEqual([]);
});

test("passing policy is captured per activity and policy edits never reclassify publications", async () => {
  const s = await setup();
  const setPolicy = (passingPercentage?: number) =>
    s.admin.mutation(api.academicSettings.updateGradingPolicy, {
      schoolId: s.schoolId,
      policy: {
        ...DEFAULT_GRADING_POLICY,
        ...(passingPercentage === undefined ? {} : { passingPercentage }),
      },
    });
  const createGraded = (title: string) =>
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title,
      grading: { maxPoints: 20 },
    });
  const read = (taskId: Id<"courseTasks">) =>
    s.student.query(api.courseTaskGrades.get, { taskId });
  const publish14 = async (args: typeof s.args) => {
    await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...args,
      points: 14,
    });
    expect(await read(args.taskId)).toMatchObject({
      draft: null,
      published: null,
    });
    await s.teacher.mutation(api.courseTaskGrades.publish, {
      ...args,
      expectedVersion: 1,
      operationId: "publish",
    });
  };

  await publish14(s.args);
  const legacy = await read(s.taskId);
  await setPolicy(70);
  const taskId = await createGraded("Passing at 70%");
  const expectedGrading = { ...s.args.expectedGrading, passingPercentage: 70 };
  expect((await read(taskId)).grading).toEqual(expectedGrading);
  const args = { ...s.args, taskId, expectedGrading };
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...args,
      expectedGrading: s.args.expectedGrading,
      points: 14,
    }),
  ).rejects.toThrow("TASK_GRADING_CHANGED");
  await publish14(args);
  const published = await read(taskId);
  expect(gradeOutcome(published.published!.points, published.grading!)).toBe(
    "passed",
  );

  await setPolicy(80);
  const future = await createGraded("Passing at 80%");
  expect((await read(future)).grading?.passingPercentage).toBe(80);
  await setPolicy();
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: future,
    grading: { maxPoints: 30 },
  });
  expect((await read(future)).grading).toMatchObject({
    maxPoints: 30,
    passingPercentage: 80,
  });
  const numericOnly = await createGraded("Numeric only");
  expect((await read(numericOnly)).grading?.passingPercentage).toBeUndefined();
  expect(await read(s.taskId)).toEqual(legacy);
  expect(await read(taskId)).toEqual(published);
});

test("task and course deletion cannot destroy grade history", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 18,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.remove, { taskId: s.taskId }),
  ).rejects.toThrow("TASK_HAS_GRADES");
  await expect(
    s.admin.mutation(api.classes.remove, { id: s.classId }),
  ).rejects.toThrow("COURSE_HAS_GRADES");
  expect(
    await s.t.run((ctx) => ctx.db.get("classes", s.classId)),
  ).not.toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.get("courseTasks", s.taskId)),
  ).not.toBeNull();
});

test("actual resubmission preserves grades while replacing files and clearing revision-bound feedback", async () => {
  const s = await setup();
  const stage = () =>
    s.t.run(async (ctx) => {
      const recipient = await ctx.db
        .query("courseTaskRecipients")
        .withIndex("by_taskId_and_studentId", (q) =>
          q.eq("taskId", s.taskId).eq("studentId", s.users.student),
        )
        .unique();
      const body = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });
      return await ctx.db.insert("courseTaskFiles", {
        taskId: s.taskId,
        recipientId: recipient!._id,
        kind: "submission",
        uploadedBy: s.users.student,
        name: "work.pdf",
        contentType: body.type,
        size: body.size,
        storageId: await ctx.storage.store(body),
        state: "staged",
        expiresAt: Date.now() + 60_000,
      });
    });
  const first = await stage();
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [first],
  });
  await s.teacher.mutation(api.courseTaskSubmissions.setFeedback, {
    taskId: s.taskId,
    studentId: s.users.student,
    expectedRevision: 1,
    text: "Try again",
  });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    expectedSubmissionRevision: 1,
    points: 10,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    expectedSubmissionRevision: 1,
    operationId: "pub",
  });
  const second = await stage();
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [second],
  });
  const submission = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(submission.feedback).toBeUndefined();
  expect(submission.submissionRevision).toBe(2);
  expect(submission.files.map(({ id }) => id)).toEqual([second]);
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({
    needsReview: true,
    published: { points: 10, submissionRevision: 1 },
  });
});

test("competing different drafts admit one winner and revocation prevents retries", async () => {
  const s = await setup();
  const results = await Promise.allSettled([
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      points: 10,
    }),
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      operationId: "other",
      points: 11,
    }),
  ]);
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
  const grade = await s.teacher.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
    studentId: s.users.student,
  });
  expect(grade.version).toBe(1);
  await s.t.run((ctx) =>
    ctx.db.patch("users", s.users.teacher, { isActive: false }),
  );
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      points: grade.draft!.points,
    }),
  ).rejects.toThrow("User not authenticated");
});

test("changing a task scale before its first grade rejects an older open review", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    grading: { maxPoints: 100 },
  });
  await expect(
    s.teacher.mutation(api.courseTaskGrades.saveDraft, {
      ...s.args,
      points: 10,
    }),
  ).rejects.toThrow("TASK_GRADING_CHANGED");
});

test("history transitions from empty to published and stays scoped to the requested recipient", async () => {
  const s = await setup();
  const args = {
    taskId: s.taskId,
    studentId: s.users.student,
    paginationOpts: { cursor: null, numItems: 1 },
  };
  expect(
    await s.teacher.query(api.courseTaskGrades.history, args),
  ).toMatchObject({
    page: [],
    isDone: true,
  });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 12,
  });
  expect(
    await s.teacher.query(api.courseTaskGrades.history, args),
  ).toMatchObject({
    page: [],
    isDone: true,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    operationId: "publish",
  });
  expect(
    await s.teacher.query(api.courseTaskGrades.history, args),
  ).toMatchObject({
    page: [{ version: 2, points: 12 }],
    isDone: true,
  });
  expect(
    await s.teacher.query(api.courseTaskGrades.history, {
      ...args,
      studentId: s.users.classmate,
    }),
  ).toMatchObject({ page: [], isDone: true });
  await expect(
    s.t
      .withIdentity({ subject: "classmate" })
      .query(api.courseTaskGrades.history, args),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("expected grading is checked on publication and institutional edits do not invalidate task snapshots", async () => {
  const s = await setup();
  await s.admin.mutation(api.academicSettings.updateGradingPolicy, {
    schoolId: s.schoolId,
    policy: { scaleMax: 10, decimalPlaces: 1, defaultMaxPoints: 50 },
  });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 12.25,
  });
  await expect(
    s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.args,
      expectedVersion: 1,
      operationId: "publish",
      expectedGrading: { ...s.args.expectedGrading, scaleMax: 10 },
    }),
  ).rejects.toThrow("TASK_GRADING_CHANGED");
  expect(
    await s.teacher.mutation(api.courseTaskGrades.publish, {
      ...s.args,
      expectedVersion: 1,
      operationId: "publish",
    }),
  ).toBe(2);
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toMatchObject({
    grading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 },
    published: { points: 12.25 },
  });
});

const weightsForQuiz = (weightBps: number) => [
  { category: "quiz" as const, weightBps },
  { category: "assignment" as const, weightBps: 10_000 - weightBps },
];

async function setupWeighting() {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.patch("classes", s.classId, { gradeAssignments: undefined }),
  );
  return s;
}

test("institution weights are inherited live without writing courses or altering grading snapshots", async () => {
  const s = await setupWeighting();
  const read = () =>
    s.student.query(api.academicSettings.getGradingWeightsForCourse, {
      classId: s.classId,
    });
  expect(await read()).toEqual({
    weights: null,
    institutionalWeights: null,
    overridden: false,
    version: 0,
  });
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 12.25,
  });
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    operationId: "published",
  });
  const grade = await s.student.query(api.courseTaskGrades.get, {
    taskId: s.taskId,
  });
  await s.admin.mutation(api.academicSettings.updateGradingWeights, {
    schoolId: s.schoolId,
    weights: weightsForQuiz(2_000),
    expectedVersion: 0,
  });
  expect(await read()).toMatchObject({
    weights: weightsForQuiz(2_000),
    overridden: false,
  });
  await s.admin.mutation(api.academicSettings.updateGradingWeights, {
    schoolId: s.schoolId,
    weights: weightsForQuiz(4_000),
    expectedVersion: 1,
  });
  expect(await read()).toMatchObject({ weights: weightsForQuiz(4_000) });
  expect(
    await s.student.query(api.courseTaskGrades.get, { taskId: s.taskId }),
  ).toEqual(grade);
  expect(
    await s.teacher.query(api.courseTasks.get, { taskId: s.taskId }),
  ).not.toHaveProperty("gradingCategory");
  const course = await s.t.run((ctx) => ctx.db.get("classes", s.classId));
  expect(course).not.toHaveProperty("gradingWeights");
  expect(
    await s.teacher.query(api.academicSettings.getGradingForCourse, {
      classId: s.classId,
    }),
  ).toEqual(DEFAULT_GRADING_POLICY);
});

test("course overrides are independent, survive old clients and can return to current institution defaults", async () => {
  const s = await setupWeighting();
  await s.admin.mutation(api.academicSettings.updateGradingWeights, {
    schoolId: s.schoolId,
    weights: weightsForQuiz(2_000),
    expectedVersion: 0,
  });
  const override = {
    classId: s.classId,
    gradingWeights: weightsForQuiz(7_000),
    expectedGradingWeightsVersion: 0,
  };
  await s.admin.mutation(api.classes.update, override);
  await s.admin.mutation(api.classes.update, override);
  await s.admin.mutation(api.classes.update, {
    classId: s.classId,
    name: "Renamed",
  });
  await s.admin.mutation(api.academicSettings.updateGradingWeights, {
    schoolId: s.schoolId,
    weights: weightsForQuiz(4_000),
    expectedVersion: 1,
  });
  expect(
    await s.teacher.query(api.academicSettings.getGradingWeightsForCourse, {
      classId: s.classId,
    }),
  ).toEqual({
    weights: weightsForQuiz(7_000),
    institutionalWeights: weightsForQuiz(4_000),
    overridden: true,
    version: 1,
  });
  const detail = await s.admin.query(api.classes.get, { id: s.classId });
  expect(detail).toMatchObject({
    gradingWeights: weightsForQuiz(7_000),
    gradingWeightsVersion: 1,
  });
  await s.t
    .withIdentity({ subject: "principal" })
    .mutation(api.classes.update, {
      classId: s.classId,
      gradingWeights: null,
      expectedGradingWeightsVersion: 1,
    });
  expect(
    await s.student.query(api.academicSettings.getGradingWeightsForCourse, {
      classId: s.classId,
    }),
  ).toMatchObject({
    weights: weightsForQuiz(4_000),
    overridden: false,
    version: 2,
  });
});

test("weight permissions preserve institution and course boundaries", async () => {
  const s = await setupWeighting();
  for (const subject of [
    "teacher",
    "student",
    "tutor",
    "outsider",
    "principal",
  ])
    await expect(
      s.t
        .withIdentity({ subject })
        .mutation(api.academicSettings.updateGradingWeights, {
          schoolId: s.schoolId,
          weights: weightsForQuiz(2_000),
          expectedVersion: 0,
        }),
    ).rejects.toThrow("PERMISSION_DENIED");
  for (const subject of ["teacher", "student", "tutor", "outsider"])
    await expect(
      s.t.withIdentity({ subject }).mutation(api.classes.update, {
        classId: s.classId,
        gradingWeights: weightsForQuiz(2_000),
        expectedGradingWeightsVersion: 0,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.t
      .withIdentity({ subject: "outsider" })
      .query(api.academicSettings.getGradingWeightsForCourse, {
        classId: s.classId,
      }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.t.query(api.academicSettings.getGradingWeightsForCourse, {
      classId: s.classId,
    }),
  ).rejects.toThrow();
  const otherSchoolId = await s.t.run((ctx) =>
    ctx.db.insert("schools", {
      name: "Other",
      slug: "other",
      isActive: true,
      createdAt: Date.now(),
      createdBy: s.users.outsider,
    }),
  );
  await expect(
    s.admin.mutation(api.academicSettings.updateGradingWeights, {
      schoolId: otherSchoolId,
      weights: weightsForQuiz(2_000),
      expectedVersion: 0,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.admin.query(api.academicSettings.getGradingWeights, {
      schoolId: otherSchoolId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("weight writes reject invalid totals and stale versions without partial changes", async () => {
  const s = await setupWeighting();
  const initial = {
    schoolId: s.schoolId,
    weights: weightsForQuiz(2_000),
    expectedVersion: 0,
  };
  expect(
    await s.admin.mutation(api.academicSettings.updateGradingWeights, initial),
  ).toBe(1);
  expect(
    await s.admin.mutation(api.academicSettings.updateGradingWeights, initial),
  ).toBe(1);
  await expect(
    s.admin.mutation(api.academicSettings.updateGradingWeights, {
      ...initial,
      weights: weightsForQuiz(3_000),
    }),
  ).rejects.toThrow("GRADING_WEIGHTS_CHANGED");
  for (const weights of [
    [],
    [{ category: "quiz" as const, weightBps: 9_999 }],
    [{ category: "quiz" as const, weightBps: NaN }],
    [{ category: "quiz" as const, weightBps: 10_000.1 }],
    [
      { category: "quiz" as const, weightBps: 5_000 },
      { category: "quiz" as const, weightBps: 5_000 },
    ],
  ]) {
    await expect(
      s.admin.mutation(api.academicSettings.updateGradingWeights, {
        ...initial,
        expectedVersion: 1,
        weights,
      }),
    ).rejects.toThrow("INVALID_GRADING_WEIGHTS");
    await expect(
      s.admin.mutation(api.classes.update, {
        classId: s.classId,
        name: "Must not change",
        gradingWeights: weights,
        expectedGradingWeightsVersion: 0,
      }),
    ).rejects.toThrow("INVALID_GRADING_WEIGHTS");
  }
  await s.admin.mutation(api.classes.update, {
    classId: s.classId,
    gradingWeights: weightsForQuiz(0),
    expectedGradingWeightsVersion: 0,
  });
  await expect(
    s.admin.mutation(api.classes.update, {
      classId: s.classId,
      gradingWeights: null,
      expectedGradingWeightsVersion: 0,
    }),
  ).rejects.toThrow("GRADING_WEIGHTS_CHANGED");
  await expect(
    s.admin.mutation(api.classes.update, {
      classId: s.classId,
      gradingWeights: weightsForQuiz(3_000),
    }),
  ).rejects.toThrow("INVALID_GRADING_WEIGHTS_VERSION");
  expect(
    await s.t.run((ctx) => ctx.db.get("classes", s.classId)),
  ).toMatchObject({
    name: "Math",
    gradingWeights: weightsForQuiz(0),
    gradingWeightsVersion: 1,
  });
});

test("categories are independent of format, explicit for legacy activities and locked once assigned and graded", async () => {
  const s = await setupWeighting();
  const id = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Assessment",
    grading: { maxPoints: 20 },
    gradingCategory: "quiz",
  });
  expect(
    await s.teacher.query(api.courseTasks.get, { taskId: id }),
  ).toMatchObject({
    gradingCategory: "quiz",
  });
  await expect(
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Ungraded",
      gradingCategory: "assignment",
    }),
  ).rejects.toThrow("TASK_NOT_GRADABLE");
  await s.teacher.mutation(api.courseTaskGrades.saveDraft, {
    ...s.args,
    points: 12,
  });
  const legacy = (await s.teacher.query(api.courseTasks.get, {
    taskId: s.taskId,
  }))!;
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    gradingCategory: "assignment",
    expectedUpdatedAt: legacy.updatedAt,
  });
  const classified = (await s.teacher.query(api.courseTasks.get, {
    taskId: s.taskId,
  }))!;
  expect(classified.gradingCategory).toBe("assignment");
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      gradingCategory: "quiz",
      expectedUpdatedAt: legacy.updatedAt,
    }),
  ).rejects.toThrow("GRADING_CATEGORY_CHANGED");
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: s.taskId,
      gradingCategory: "quiz",
      expectedUpdatedAt: classified.updatedAt,
    }),
  ).rejects.toThrow("TASK_GRADING_CATEGORY_LOCKED");
  await s.teacher.mutation(api.courseTaskGrades.publish, {
    ...s.args,
    expectedVersion: 1,
    operationId: "publish-after-classification",
  });
  expect(
    await s.student.query(api.courseTaskGrades.get, {
      taskId: s.taskId,
    }),
  ).toMatchObject({ published: { points: 12 } });
});

test.each(["metadata", "close", "reopen"] as const)(
  "%s edits cannot roll back the category version or admit an outdated category edit",
  async (operation) => {
    const s = await setup();
    const original = (await s.t.run((ctx) =>
      ctx.db.get("courseTasks", s.taskId),
    ))!;
    if (operation === "reopen")
      await s.t.run((ctx) =>
        ctx.db.patch("courseTasks", s.taskId, {
          manuallyClosedAt: original.updatedAt,
          manuallyClosedBy: s.users.teacher,
        }),
      );
    const clock = vi.spyOn(Date, "now").mockReturnValue(original.updatedAt);
    try {
      await s.teacher.mutation(api.courseTasks.update, {
        taskId: s.taskId,
        gradingCategory: "quiz",
        expectedUpdatedAt: original.updatedAt,
      });
      const classified = (await s.t.run((ctx) =>
        ctx.db.get("courseTasks", s.taskId),
      ))!;
      if (operation === "metadata")
        await s.teacher.mutation(api.courseTasks.update, {
          taskId: s.taskId,
          title: "Updated title",
        });
      else
        await s.teacher.mutation(api.courseTasks.setClosed, {
          taskId: s.taskId,
          closed: operation === "close",
        });
      const updated = (await s.t.run((ctx) =>
        ctx.db.get("courseTasks", s.taskId),
      ))!;
      expect(updated.updatedAt).toBe(classified.updatedAt + 1);
      await expect(
        s.teacher.mutation(api.courseTasks.update, {
          taskId: s.taskId,
          gradingCategory: "assignment",
          expectedUpdatedAt: original.updatedAt,
        }),
      ).rejects.toThrow("GRADING_CATEGORY_CHANGED");
      expect(updated.gradingCategory).toBe("quiz");
    } finally {
      clock.mockRestore();
    }
  },
);

test("new quizzes store their category without copying course weights into grading snapshots", async () => {
  const s = await setupWeighting();
  await s.admin.mutation(api.academicSettings.updateGradingWeights, {
    schoolId: s.schoolId,
    weights: weightsForQuiz(2_000),
    expectedVersion: 0,
  });
  const id = await s.teacher.mutation(api.courseQuizzes.create, {
    classId: s.classId,
    title: "Quiz",
    dueAt: Date.now() + 60_000,
    durationMinutes: 1,
    gradingCategory: "quiz",
    questions: [{ kind: "text", prompt: "Explain", maxPoints: 10 }],
  });
  expect(
    await s.teacher.query(api.courseTasks.get, { taskId: id }),
  ).toMatchObject({
    gradingCategory: "quiz",
    grading: { maxPoints: 10, scaleMax: 100, decimalPlaces: 2 },
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: id }))?.grading,
  ).not.toHaveProperty("gradingWeights");
});

test("competing institution and course weighting edits admit one complete winner", async () => {
  const s = await setupWeighting();
  const institutionResults = await Promise.allSettled(
    [2_000, 4_000].map((value) =>
      s.admin.mutation(api.academicSettings.updateGradingWeights, {
        schoolId: s.schoolId,
        weights: weightsForQuiz(value),
        expectedVersion: 0,
      }),
    ),
  );
  expect(
    institutionResults.filter(({ status }) => status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    institutionResults.filter(({ status }) => status === "rejected"),
  ).toHaveLength(1);
  expect(
    await s.admin.query(api.academicSettings.getGradingWeights, {
      schoolId: s.schoolId,
    }),
  ).toMatchObject({ version: 1 });
  const courseResults = await Promise.allSettled(
    [6_000, 8_000].map((value) =>
      s.admin.mutation(api.classes.update, {
        classId: s.classId,
        gradingWeights: weightsForQuiz(value),
        expectedGradingWeightsVersion: 0,
      }),
    ),
  );
  expect(
    courseResults.filter(({ status }) => status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    courseResults.filter(({ status }) => status === "rejected"),
  ).toHaveLength(1);
  const course = await s.admin.query(
    api.academicSettings.getGradingWeightsForCourse,
    {
      classId: s.classId,
    },
  );
  expect(course.version).toBe(1);
  expect([weightsForQuiz(6_000), weightsForQuiz(8_000)]).toContainEqual(
    course.weights,
  );
});
