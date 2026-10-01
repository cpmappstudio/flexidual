import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { canSubmitCourseTask } from "./model/courseTaskAccess";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.UTC(2026, 8, 28, 12);
const HOUR = 3_600_000;
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const roles = [
      "admin",
      "teacher",
      "tutor",
      "student",
      "classmate",
      "newStudent",
      "outsider",
    ] as const;
    const users = {} as Record<(typeof roles)[number], Id<"users">>;
    for (const role of roles) {
      users[role] = await ctx.db.insert("users", {
        clerkId: role,
        firstName: role,
        lastName: "Test",
        fullName: `${role} Test`,
        isActive: true,
        createdAt: NOW,
      });
    }
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
      assignedBy: users.admin,
    });
    for (const studentId of [
      users.student,
      users.classmate,
      users.newStudent,
    ]) {
      await ctx.db.insert("roleAssignments", {
        userId: studentId,
        role: "student",
        orgType: "campus",
        orgId: campusId,
        schoolId,
        gradeCode: "05",
        assignedAt: NOW,
        assignedBy: users.admin,
      });
    }
    const classId = await ctx.db.insert("classes", {
      schoolId,
      campusId,
      curriculumId,
      teacherId: users.teacher,
      tutorId: users.tutor,
      name: "Math 5",
      gradeCode: "05",
      endDate: NOW + 7 * DAY,
      enrollmentsMigratedAt: NOW,
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    for (const studentId of [users.student, users.classmate]) {
      await ctx.db.insert("classEnrollments", {
        classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: users.admin,
      });
    }
    return { users, classId };
  });
  return {
    t,
    ...data,
    teacher: t.withIdentity({ subject: "teacher" }),
    admin: t.withIdentity({ subject: "admin" }),
    tutor: t.withIdentity({ subject: "tutor" }),
    student: t.withIdentity({ subject: "student" }),
    outsider: t.withIdentity({ subject: "outsider" }),
    newStudent: t.withIdentity({ subject: "newStudent" }),
  };
}

test("publishes immediately to enrolled students and protects access", async () => {
  const s = await setup();
  await expect(
    s.tutor.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Tutor task",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "  Fractions  ",
  });
  const task = await s.student.query(api.courseTasks.get, { taskId });
  expect(task).toMatchObject({ title: "Fractions", releasedAt: NOW });
  expect(
    await s.student.query(api.courseTasks.get, { taskId: "invalid-id" }),
  ).toBeNull();
  expect(
    await s.student.query(api.courseTasks.get, { taskId: s.classId }),
  ).toBeNull();
  expect(task?.allowLateSubmissions).toBe(true);
  await expect(s.tutor.query(api.courseTasks.get, { taskId })).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await expect(
    s.outsider.query(api.courseTasks.listForClass, {
      classId: s.classId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const studentPage = await s.student.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(studentPage.page.map((item) => item._id)).toEqual([taskId]);
  const rows = await s.t.run(async (ctx) => ({
    recipients: await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", taskId))
      .collect(),
    notifications: await ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task"),
      )
      .collect(),
  }));
  expect(rows.recipients).toHaveLength(2);
  expect(rows.notifications).toHaveLength(2);
  expect(rows.notifications[0]).toMatchObject({
    taskId,
    taskTitle: "Fractions",
  });
});

test("removing a course also removes its tasks, submissions, files, and task notifications", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Fractions",
    dueAt: NOW + 2 * DAY,
  });
  await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Unfinished upload",
    draft: true,
  });
  await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Future assignment",
    availableAt: NOW + DAY,
    dueAt: NOW + 3 * DAY,
  });
  const storageIds = await s.t.run(async (ctx) => {
    const recipient = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", taskId).eq("studentId", s.users.student),
      )
      .unique();
    const materialStorageId = await ctx.storage.store(new Blob(["guide"]));
    const submissionStorageId = await ctx.storage.store(new Blob(["answer"]));
    await ctx.db.insert("courseTaskFiles", {
      taskId,
      kind: "material",
      uploadedBy: s.users.teacher,
      name: "guide.pdf",
      contentType: "application/pdf",
      size: 5,
      storageId: materialStorageId,
      state: "active",
    });
    await ctx.db.insert("courseTaskFiles", {
      taskId,
      recipientId: recipient!._id,
      kind: "submission",
      uploadedBy: s.users.student,
      name: "answer.pdf",
      contentType: "application/pdf",
      size: 6,
      storageId: submissionStorageId,
      state: "active",
    });
    for (let index = 0; index < 51; index++) {
      await ctx.db.insert("courseTaskFiles", {
        taskId,
        kind: "submission",
        uploadedBy: s.users.student,
        name: `staged-${index}.pdf`,
        contentType: "application/pdf",
        size: 1,
        state: "staged",
        expiresAt: NOW + HOUR,
      });
      await ctx.db.insert("systemNotifications", {
        recipientId: s.users.student,
        kind: "course_task_reminder",
        classId: s.classId,
        taskId,
        dedupeKey: `task-reminder:${taskId}:${index}`,
        createdAt: NOW,
      });
    }
    return [materialStorageId, submissionStorageId];
  });

  await s.admin.mutation(api.classes.remove, { id: s.classId });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);

  const remaining = await s.t.run(async (ctx) => ({
    course: await ctx.db.get("classes", s.classId),
    tasks: await ctx.db.query("courseTasks").collect(),
    recipients: await ctx.db.query("courseTaskRecipients").collect(),
    files: await ctx.db.query("courseTaskFiles").collect(),
    taskNotifications: await ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task"),
      )
      .collect(),
    reminderNotifications: await ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task_reminder"),
      )
      .collect(),
    storedFiles: await Promise.all(storageIds.map((id) => ctx.storage.get(id))),
  }));
  expect(remaining).toMatchObject({
    course: null,
    tasks: [],
    recipients: [],
    files: [],
    taskNotifications: [],
    reminderNotifications: [],
    storedFiles: [null, null],
  });
});

test("lists assignments by availability, with scheduled tasks after visible tasks", async () => {
  const s = await setup();
  const olderId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Published first",
  });
  vi.setSystemTime(NOW + HOUR);
  const newerId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Published later",
  });
  const scheduledId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Scheduled",
    availableAt: NOW + 2 * HOUR,
  });
  const paginationOpts = { cursor: null, numItems: 10 };

  const teacherPage = await s.teacher.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts,
  });
  expect(teacherPage.page.map((task) => task._id)).toEqual([
    scheduledId,
    newerId,
    olderId,
  ]);
  const studentPage = await s.student.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts,
  });
  expect(studentPage.page.map((task) => task._id)).toEqual([newerId, olderId]);
});

test("students see an older assigned task even after twenty newer unassigned tasks", async () => {
  const s = await setup();
  const assignedTaskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Long-running project",
    dueAt: NOW + 5 * DAY,
  });
  for (let index = 0; index < 20; index++) {
    vi.setSystemTime(NOW + index + 1);
    await s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: `Short task ${index}`,
      dueAt: NOW + HOUR,
      allowLateSubmissions: false,
    });
  }
  vi.setSystemTime(NOW + 2 * HOUR);
  await s.admin.mutation(api.classes.addStudent, {
    classId: s.classId,
    studentId: s.users.newStudent,
  });

  const teacherPage = await s.teacher.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(teacherPage.page).toHaveLength(20);
  expect(teacherPage.isDone).toBe(false);

  const studentPage = await s.newStudent.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(studentPage.page.map((task) => task._id)).toEqual([assignedTaskId]);
  expect(studentPage.isDone).toBe(true);
});

test("student assignment pages keep release order without gaps", async () => {
  const s = await setup();
  const taskIds: Id<"courseTasks">[] = [];
  for (let index = 0; index < 23; index++) {
    vi.setSystemTime(NOW + index * 1_000);
    taskIds.push(
      await s.teacher.mutation(api.courseTasks.create, {
        classId: s.classId,
        title: `Task ${index}`,
      }),
    );
  }

  let cursor: string | null = null;
  const visibleIds: Id<"courseTasks">[] = [];
  for (let index = 0; index < 3; index++) {
    const result: FunctionReturnType<typeof api.courseTasks.listForClass> =
      await s.student.query(api.courseTasks.listForClass, {
        classId: s.classId,
        paginationOpts: { cursor, numItems: 10 },
      });
    visibleIds.push(...result.page.map((task) => task._id));
    cursor = result.continueCursor;
    expect(result.isDone).toBe(index === 2);
  }
  expect(visibleIds).toEqual(taskIds.reverse());
});

test("availability order remains correct across pages and after rescheduling", async () => {
  const s = await setup();
  const visibleId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Visible",
  });
  const earlierId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Earlier start",
    availableAt: NOW + 2 * HOUR,
  });
  const laterId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Later start",
    availableAt: NOW + 3 * HOUR,
  });
  const listIds = async () => {
    const first = await s.teacher.query(api.courseTasks.listForClass, {
      classId: s.classId,
      paginationOpts: { cursor: null, numItems: 2 },
    });
    const second = await s.teacher.query(api.courseTasks.listForClass, {
      classId: s.classId,
      paginationOpts: { cursor: first.continueCursor, numItems: 2 },
    });
    return [...first.page, ...second.page].map((task) => task._id);
  };

  expect(await listIds()).toEqual([laterId, earlierId, visibleId]);
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: earlierId,
    availableAt: NOW + 4 * HOUR,
  });
  expect(await listIds()).toEqual([earlierId, laterId, visibleId]);
});

test("backfills availability order for existing tasks without changing upload attempts", async () => {
  const s = await setup();
  const [legacyId, draftId] = await s.t.run(async (ctx) => [
    await ctx.db.insert("courseTasks", {
      classId: s.classId,
      createdBy: s.users.teacher,
      title: "Legacy visible task",
      releasedAt: NOW - HOUR,
      allowLateSubmissions: true,
      updatedAt: NOW,
    }),
    await ctx.db.insert("courseTasks", {
      classId: s.classId,
      createdBy: s.users.teacher,
      isDraft: true,
      title: "Upload attempt",
      allowLateSubmissions: true,
      updatedAt: NOW,
    }),
  ]);
  await s.t.mutation(
    internal.migration.backfillCourseTaskAvailabilitySortAt,
    {},
  );
  const [legacy, draft] = await s.t.run(async (ctx) => [
    await ctx.db.get("courseTasks", legacyId),
    await ctx.db.get("courseTasks", draftId),
  ]);
  expect(legacy?.availabilitySortAt).toBe(NOW - HOUR);
  expect(draft?.availabilitySortAt).toBeUndefined();
});

test("backfills existing task recipients without losing their submissions", async () => {
  const s = await setup();
  const taskId = await s.t.run((ctx) =>
    ctx.db.insert("courseTasks", {
      classId: s.classId,
      createdBy: s.users.teacher,
      title: "Existing task",
      releasedAt: NOW - HOUR,
      allowLateSubmissions: true,
      updatedAt: NOW,
    }),
  );
  const recipientId = await s.t.run((ctx) =>
    ctx.db.insert("courseTaskRecipients", {
      taskId,
      studentId: s.users.student,
      assignedAt: NOW - HOUR,
      submittedAt: NOW,
      submissionRevision: 1,
    }),
  );
  const args = {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 20 },
  };
  expect(
    (await s.student.query(api.courseTasks.listForClass, args)).page.map(
      (task) => task._id,
    ),
  ).toEqual([taskId]);

  await s.t.mutation(
    internal.migration.backfillCourseTaskRecipientOrdering,
    {},
  );
  await s.t.mutation(
    internal.migration.backfillCourseTaskRecipientOrdering,
    {},
  );

  const recipient = await s.t.run((ctx) =>
    ctx.db.get("courseTaskRecipients", recipientId),
  );
  expect(recipient).toMatchObject({
    classId: s.classId,
    releasedAt: NOW - HOUR,
    submittedAt: NOW,
    submissionRevision: 1,
  });
  expect(
    (await s.student.query(api.courseTasks.listForClass, args)).page.map(
      (task) => task._id,
    ),
  ).toEqual([taskId]);
});

test("recipient ordering backfill continues beyond one batch and remains idempotent", async () => {
  const s = await setup();
  const taskId = await s.t.run((ctx) =>
    ctx.db.insert("courseTasks", {
      classId: s.classId,
      createdBy: s.users.teacher,
      title: "Existing assignment",
      releasedAt: NOW - HOUR,
      allowLateSubmissions: true,
      updatedAt: NOW,
    }),
  );
  const recipientIds = await s.t.run(async (ctx) => {
    const ids: Id<"courseTaskRecipients">[] = [];
    for (let index = 0; index < 101; index++) {
      const studentId = await ctx.db.insert("users", {
        clerkId: `legacy-student-${index}`,
        firstName: "Legacy",
        lastName: String(index),
        fullName: `Legacy ${index}`,
        isActive: true,
        createdAt: NOW,
      });
      ids.push(
        await ctx.db.insert("courseTaskRecipients", {
          taskId,
          studentId,
          assignedAt: NOW - HOUR,
          submissionRevision: index === 100 ? 2 : 0,
          submittedAt: index === 100 ? NOW : undefined,
        }),
      );
    }
    return ids;
  });

  await s.t.mutation(
    internal.migration.backfillCourseTaskRecipientOrdering,
    {},
  );
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await s.t.mutation(
    internal.migration.backfillCourseTaskRecipientOrdering,
    {},
  );

  const recipients = await s.t.run((ctx) =>
    Promise.all(
      recipientIds.map((id) => ctx.db.get("courseTaskRecipients", id)),
    ),
  );
  expect(recipients).toHaveLength(101);
  expect(
    recipients.every(
      (recipient) =>
        recipient?.classId === s.classId && recipient.releasedAt === NOW - HOUR,
    ),
  ).toBe(true);
  expect(recipients[100]).toMatchObject({
    submittedAt: NOW,
    submissionRevision: 2,
  });

  let cursor: string | null = null;
  const listedStudents: Id<"users">[] = [];
  do {
    const page: FunctionReturnType<
      typeof api.courseTaskSubmissions.listForTask
    > = await s.teacher.query(api.courseTaskSubmissions.listForTask, {
      taskId,
      paginationOpts: { cursor, numItems: 20 },
    });
    listedStudents.push(...page.page.map((row) => row.studentId));
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor !== null);
  expect(listedStudents).toHaveLength(101);
  expect(new Set(listedStudents).size).toBe(101);
});

test("keeps upload attempts out of the course and cleans discarded attempts", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Unfinished upload",
    draft: true,
  });
  const page = await s.teacher.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(page.page).toHaveLength(0);
  await expect(
    s.student.query(api.courseTasks.get, { taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.admin.mutation(api.courseTasks.discardUnpublished, { taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await s.teacher.mutation(api.courseTasks.discardUnpublished, { taskId }),
  ).toBe("discarded");
  expect(await s.t.run((ctx) => ctx.db.get("courseTasks", taskId))).toBeNull();
  const notifications = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task"),
      )
      .collect(),
  );
  expect(notifications).toHaveLength(0);
});

test("expires abandoned attempts but never removes a published assignment", async () => {
  const s = await setup();
  const abandonedId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Abandoned",
    draft: true,
  });
  const publishedId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Completed",
    draft: true,
  });
  await s.teacher.mutation(api.courseTasks.publish, {
    taskId: publishedId,
    materialFileIds: [],
  });
  vi.setSystemTime(NOW + 2 * HOUR + 1);
  await s.t.mutation(internal.courseTasks.expireUnpublished, {
    taskId: abandonedId,
  });
  await s.t.mutation(internal.courseTasks.expireUnpublished, {
    taskId: publishedId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("courseTasks", abandonedId)),
  ).toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.get("courseTasks", publishedId)),
  ).not.toBeNull();
});

test("a scheduled task published from an upload attempt waits before notifying students", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Scheduled upload",
    availableAt: NOW + HOUR,
    draft: true,
  });
  await s.teacher.mutation(api.courseTasks.publish, {
    taskId,
    materialFileIds: [],
  });
  const paginationOpts = { cursor: null, numItems: 10 };
  expect(
    (
      await s.teacher.query(api.courseTasks.listForClass, {
        classId: s.classId,
        paginationOpts,
      })
    ).page.map((task) => task._id),
  ).toEqual([taskId]);
  expect(
    (
      await s.student.query(api.courseTasks.listForClass, {
        classId: s.classId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(0);
  const listNotifications = () =>
    s.t.run((ctx) =>
      ctx.db
        .query("systemNotifications")
        .withIndex("by_class_and_kind", (q) =>
          q.eq("classId", s.classId).eq("kind", "course_task"),
        )
        .collect(),
    );
  expect(await listNotifications()).toHaveLength(0);
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseTasks.release, {
    taskId,
    expectedAvailableAt: NOW + HOUR,
  });
  expect(
    (
      await s.student.query(api.courseTasks.listForClass, {
        classId: s.classId,
        paginationOpts,
      })
    ).page.map((task) => task._id),
  ).toEqual([taskId]);
  expect(await listNotifications()).toHaveLength(2);
});

test("notification feed shows the current task, course, and deadline", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Fractions",
    dueAt: NOW + DAY,
  });
  const getNotification = async () => {
    const feed = await s.student.query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    return feed.page.find((item) => item.taskId === taskId);
  };

  expect(await getNotification()).toMatchObject({
    taskTitle: "Fractions",
    className: "Math 5",
    taskDueAt: NOW + DAY,
    taskTimeZone: "UTC",
  });

  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    title: "Fractions revised",
    dueAt: NOW + 2 * DAY,
  });
  await s.t.run((ctx) =>
    ctx.db.patch("classes", s.classId, { name: "Math 5 revised" }),
  );
  expect(await getNotification()).toMatchObject({
    taskTitle: "Fractions revised",
    className: "Math 5 revised",
    taskDueAt: NOW + 2 * DAY,
  });

  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: null,
  });
  expect(await getNotification()).not.toHaveProperty("taskDueAt");
  const stored = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) =>
        q.eq("dedupeKey", `course_task:assigned:${taskId}:${s.users.student}`),
      )
      .unique(),
  );
  expect(stored).toMatchObject({
    taskTitle: "Fractions",
    className: "Math 5",
  });
});

test("rescheduling prevents stale publication and notifies once at release", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Scheduled",
    availableAt: NOW + HOUR,
    dueAt: NOW + 4 * HOUR,
  });
  await expect(
    s.student.query(api.courseTasks.get, { taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const managerPage = await s.teacher.query(api.courseTasks.listForClass, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(managerPage.page).toHaveLength(1);
  expect(managerPage.page[0].releasedAt).toBeUndefined();
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId,
      availableAt: NOW + 5 * HOUR,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId,
      dueAt: NOW + HOUR,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    availableAt: NOW + 2 * HOUR,
  });
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.courseTasks.release, {
    taskId,
    expectedAvailableAt: NOW + HOUR,
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId }))?.releasedAt,
  ).toBeUndefined();
  vi.setSystemTime(NOW + 2 * HOUR);
  await s.t.mutation(internal.courseTasks.release, {
    taskId,
    expectedAvailableAt: NOW + 2 * HOUR,
  });
  await s.t.mutation(internal.courseTasks.release, {
    taskId,
    expectedAvailableAt: NOW + 2 * HOUR,
  });
  expect(
    (await s.student.query(api.courseTasks.get, { taskId }))?.releasedAt,
  ).toBe(NOW + 2 * HOUR);
  const counts = await s.t.run(async (ctx) => ({
    recipients: await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", taskId))
      .collect(),
    notifications: await ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task"),
      )
      .collect(),
  }));
  expect(counts.recipients).toHaveLength(2);
  expect(counts.notifications).toHaveLength(2);
});

test("the scheduled job publishes the task at its availability time", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Scheduled job",
    availableAt: NOW + HOUR,
    dueAt: NOW + 2 * HOUR,
  });
  await s.admin.mutation(api.classes.addStudent, {
    classId: s.classId,
    studentId: s.users.newStudent,
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await s.student.query(api.courseTasks.get, { taskId }))?.releasedAt,
  ).toBe(NOW + HOUR);
  expect(
    await s.newStudent.query(api.courseTasks.get, { taskId }),
  ).not.toBeNull();
});

test("reminds only students without a submission on the previous local day", async () => {
  const s = await setup();
  const dueAt = NOW + 2 * DAY;
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Fractions",
    dueAt,
  });
  const task = (await s.teacher.query(api.courseTasks.get, { taskId }))!;
  expect(task.reminderScheduledId).toBeDefined();
  await s.t.run(async (ctx) => {
    const recipient = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", taskId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.patch("courseTaskRecipients", recipient!._id, {
      submittedAt: NOW + HOUR,
    });
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const reminders = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task_reminder"),
      )
      .collect(),
  );
  expect(reminders).toHaveLength(1);
  expect(reminders[0]).toMatchObject({
    taskId,
    recipientId: s.users.classmate,
    createdAt: NOW + DAY - 4 * HOUR,
  });
});

test("the next-day reminder continues through multiple recipient pages without duplicates", async () => {
  const s = await setup();
  const dueAt = NOW + 2 * DAY;
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Project",
    dueAt,
  });
  await s.t.run(async (ctx) => {
    for (let index = 0; index < 49; index++) {
      const studentId = await ctx.db.insert("users", {
        clerkId: `reminder-student-${index}`,
        firstName: "Student",
        lastName: String(index),
        fullName: `Student ${index}`,
        isActive: true,
        createdAt: NOW,
      });
      await ctx.db.insert("classEnrollments", {
        classId: s.classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: s.users.admin,
      });
      await ctx.db.insert("courseTaskRecipients", {
        taskId,
        studentId,
        classId: s.classId,
        releasedAt: NOW,
        assignedAt: NOW,
        submissionRevision: 0,
      });
    }
  });

  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const reminders = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task_reminder"),
      )
      .collect(),
  );
  expect(reminders).toHaveLength(51);
  expect(new Set(reminders.map((item) => item.recipientId)).size).toBe(51);
  expect(
    reminders.every((item) => item.createdAt === NOW + DAY - 4 * HOUR),
  ).toBe(true);
});

test("deadline changes and closure invalidate stale reminders", async () => {
  const s = await setup();
  const oldDueAt = NOW + 2 * DAY;
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Fractions",
    dueAt: oldDueAt,
  });
  const oldTask = (await s.teacher.query(api.courseTasks.get, { taskId }))!;
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + 3 * DAY,
  });
  vi.setSystemTime(NOW + DAY - 4 * HOUR);
  await s.t.mutation(internal.courseTaskReminders.send, {
    taskId,
    expectedDueAt: oldDueAt,
    generation: oldTask.reminderGeneration!,
  });
  const before = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task_reminder"),
      )
      .collect(),
  );
  expect(before).toHaveLength(0);
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId,
    closed: true,
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId }))
      ?.reminderScheduledId,
  ).toBeUndefined();
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const after = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task_reminder"),
      )
      .collect(),
  );
  expect(after).toHaveLength(0);
});

test("an earlier deadline reschedules the reminder only when its send time is still ahead", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Fractions",
    dueAt: NOW + 3 * DAY,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + 2 * DAY,
  });
  const rescheduled = (await s.teacher.query(api.courseTasks.get, {
    taskId,
  }))!;
  expect(rescheduled.reminderScheduledId).toBeDefined();
  const reminder = await s.t.run((ctx) =>
    ctx.db.system.get("_scheduled_functions", rescheduled.reminderScheduledId!),
  );
  expect(reminder?.scheduledTime).toBe(NOW + DAY - 4 * HOUR);

  vi.setSystemTime(NOW + DAY);
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + HOUR,
  });
  const pastDeadline = await s.teacher.query(api.courseTasks.get, { taskId });
  expect(pastDeadline?.reminderScheduledId).toBeUndefined();
  const originalNotification = await s.student.query(
    api.systemNotifications.list,
    {
      paginationOpts: { cursor: null, numItems: 10 },
    },
  );
  expect(
    originalNotification.page.filter((item) => item.taskId === taskId),
  ).toHaveLength(1);
});

test("schedules at 8 AM in the course time zone and skips undated tasks", async () => {
  const s = await setup();
  const course = (await s.t.run((ctx) => ctx.db.get("classes", s.classId)))!;
  await s.t.run((ctx) =>
    ctx.db.patch("campuses", course.campusId!, {
      timeZone: "America/Bogota",
    }),
  );
  const undatedTaskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Undated",
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: undatedTaskId }))
      ?.reminderScheduledId,
  ).toBeUndefined();
  const datedTaskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Dated",
    dueAt: Date.UTC(2026, 8, 30, 18),
  });
  const task = (await s.teacher.query(api.courseTasks.get, {
    taskId: datedTaskId,
  }))!;
  const scheduled = await s.t.run((ctx) =>
    ctx.db.system.get("_scheduled_functions", task.reminderScheduledId!),
  );
  expect(scheduled?.scheduledTime).toBe(Date.UTC(2026, 8, 29, 13));
});

test("published deadlines can move earlier without preceding availability", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Fractions",
    dueAt: NOW + HOUR,
    allowLateSubmissions: false,
  });
  await s.admin.mutation(api.courseTasks.update, {
    taskId,
    description: "Administrator clarification",
  });
  expect(
    await s.teacher.query(api.courseTasks.previewDeadlineChange, { taskId }),
  ).toEqual({ hasSubmissions: false });
  await expect(
    s.student.query(api.courseTasks.previewDeadlineChange, { taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + HOUR / 2,
  });
  expect((await s.teacher.query(api.courseTasks.get, { taskId }))?.dueAt).toBe(
    NOW + HOUR / 2,
  );
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    title: "Fractions revised",
    dueAt: NOW + 2 * HOUR,
    allowLateSubmissions: true,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: null,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + HOUR + HOUR / 2,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + 2 * HOUR,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId,
      availableAt: NOW + HOUR,
    }),
  ).rejects.toThrow("TASK_ALREADY_RELEASED");
  vi.setSystemTime(NOW + 3 * HOUR);
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    description: "Updated after the deadline",
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + 2 * HOUR + 1,
    allowLateSubmissions: false,
  });
  const pastDue = (await s.teacher.query(api.courseTasks.get, { taskId }))!;
  const course = await s.t.run((ctx) => ctx.db.get("classes", s.classId));
  expect(
    await s.t.run((ctx) =>
      canSubmitCourseTask(ctx, course!, pastDue, NOW + 3 * HOUR),
    ),
  ).toBe(false);
  await expect(
    s.teacher.mutation(api.courseTasks.update, { taskId, dueAt: NOW }),
  ).rejects.toThrow("INVALID_TASK_DATES");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: null,
  });
  const task = await s.student.query(api.courseTasks.get, { taskId });
  expect(task).toMatchObject({
    title: "Fractions revised",
    description: "Updated after the deadline",
    allowLateSubmissions: true,
  });
  expect(task?.dueAt).toBeUndefined();
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId,
    closed: true,
  });
  const closed = (await s.teacher.query(api.courseTasks.get, { taskId }))!;
  expect(
    await s.t.run((ctx) =>
      canSubmitCourseTask(ctx, course!, closed, NOW + 3 * HOUR),
    ),
  ).toBe(false);
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId,
    closed: false,
  });
  const reopened = (await s.teacher.query(api.courseTasks.get, { taskId }))!;
  expect(
    await s.t.run((ctx) =>
      canSubmitCourseTask(ctx, course!, reopened, NOW + 3 * HOUR),
    ),
  ).toBe(true);
});

test("newly enrolled students receive only currently open tasks", async () => {
  const s = await setup();
  const openTaskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Open task",
  });
  const closedTaskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Closed task",
  });
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId: closedTaskId,
    closed: true,
  });
  await s.admin.mutation(api.classes.addStudent, {
    classId: s.classId,
    studentId: s.users.newStudent,
  });
  const recipientIds = await s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("courseTaskRecipients")
        .withIndex("by_studentId_and_taskId", (q) =>
          q.eq("studentId", s.users.newStudent),
        )
        .collect()
    ).map((item) => item.taskId),
  );
  expect(recipientIds).toEqual([openTaskId]);
  expect(
    await s.newStudent.query(api.courseTasks.get, { taskId: openTaskId }),
  ).not.toBeNull();
  await expect(
    s.newStudent.query(api.courseTasks.get, { taskId: closedTaskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId: closedTaskId,
    closed: false,
  });
  expect(
    await s.newStudent.query(api.courseTasks.get, { taskId: closedTaskId }),
  ).not.toBeNull();
  await s.admin.mutation(api.classes.removeStudent, {
    classId: s.classId,
    studentId: s.users.newStudent,
  });
  const feed = await s.newStudent.query(api.systemNotifications.list, {
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(feed.page.some((item) => item.kind === "course_task")).toBe(false);
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("courseTaskRecipients")
        .withIndex("by_taskId_and_studentId", (q) =>
          q.eq("taskId", openTaskId).eq("studentId", s.users.newStudent),
        )
        .unique(),
    ),
  ).not.toBeNull();
});

test("does not offer or accept reopening after a strict deadline", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Timed task",
    dueAt: NOW + HOUR,
    allowLateSubmissions: false,
  });
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId,
    closed: true,
  });
  vi.setSystemTime(NOW + 2 * HOUR);
  expect(
    await s.teacher.query(api.courseTasks.getStatus, {
      taskId,
      now: NOW + 2 * HOUR,
    }),
  ).toMatchObject({ submissionsOpen: false, canReopen: false });
  await expect(
    s.teacher.mutation(api.courseTasks.setClosed, {
      taskId,
      closed: false,
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CLOSED");
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId }))?.manuallyClosedAt,
  ).toBeDefined();
});

test("extending an expired deadline assigns students who enrolled while it was closed", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Short task",
    dueAt: NOW + HOUR,
    allowLateSubmissions: false,
  });
  vi.setSystemTime(NOW + 2 * HOUR);
  await s.admin.mutation(api.classes.addStudent, {
    classId: s.classId,
    studentId: s.users.newStudent,
  });
  await expect(
    s.newStudent.query(api.courseTasks.get, { taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    dueAt: NOW + 3 * HOUR,
  });
  expect(
    await s.newStudent.query(api.courseTasks.get, { taskId }),
  ).not.toBeNull();
});

test("rejects unusable dates and edits after the course ends", async () => {
  const s = await setup();
  await expect(
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Past start",
      availableAt: NOW - 1,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
  await expect(
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Past due",
      dueAt: NOW - 1,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
  await expect(
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "No due date",
      allowLateSubmissions: false,
    }),
  ).rejects.toThrow("INVALID_LATE_SUBMISSIONS");
  await expect(
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Inverted",
      availableAt: NOW + 2 * HOUR,
      dueAt: NOW + HOUR,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "History",
  });
  vi.setSystemTime(NOW + 8 * DAY);
  expect(await s.student.query(api.courseTasks.get, { taskId })).not.toBeNull();
  await expect(
    s.teacher.mutation(api.courseTasks.update, { taskId, title: "Changed" }),
  ).rejects.toThrow("COURSE_CLOSED");
  await expect(
    s.teacher.mutation(api.courseTasks.setClosed, { taskId, closed: true }),
  ).rejects.toThrow("COURSE_CLOSED");
});

test("defaults dated tasks to on-time submissions unless the teacher opts in", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Dated task",
    dueAt: NOW + HOUR,
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId }))
      ?.allowLateSubmissions,
  ).toBe(false);

  const undatedId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Undated task",
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: undatedId,
    dueAt: NOW + HOUR,
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: undatedId }))
      ?.allowLateSubmissions,
  ).toBe(false);

  const optInId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Late submissions allowed",
    dueAt: NOW + HOUR,
    allowLateSubmissions: true,
  });
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: optInId }))
      ?.allowLateSubmissions,
  ).toBe(true);
});

test("rejects a scheduled start that has already passed when publishing or editing", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Scheduled task",
    availableAt: NOW + HOUR,
  });
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId,
      availableAt: NOW - 1,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");

  const draftId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Upload attempt",
    availableAt: NOW + 1,
    draft: true,
  });
  vi.setSystemTime(NOW + 2);
  await expect(
    s.teacher.mutation(api.courseTasks.publish, {
      taskId: draftId,
      materialFileIds: [],
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
});

test("clearing a scheduled start publishes immediately and notifies once", async () => {
  const s = await setup();
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Scheduled task",
    availableAt: NOW + HOUR,
  });
  await s.teacher.mutation(api.courseTasks.update, {
    taskId,
    availableAt: null,
  });
  expect(
    (await s.student.query(api.courseTasks.get, { taskId }))?.releasedAt,
  ).toBe(NOW);
  const notifications = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task"),
      )
      .collect(),
  );
  expect(notifications).toHaveLength(2);
});

test("task creation uses the academic period when a legacy course has no endDate", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", s.classId))!;
    const periodId = await ctx.db.insert("academicPeriods", {
      schoolId: course.schoolId!,
      name: "2026-II",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    await ctx.db.patch("classes", s.classId, {
      endDate: undefined,
      academicPeriodId: periodId,
    });
  });
  const taskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Legacy course task",
    dueAt: NOW + DAY,
  });
  expect(await s.student.query(api.courseTasks.get, { taskId })).not.toBeNull();
  await expect(
    s.teacher.mutation(api.courseTasks.create, {
      classId: s.classId,
      title: "Beyond course end",
      dueAt: NOW + 3 * DAY,
    }),
  ).rejects.toThrow("INVALID_TASK_DATES");
});
