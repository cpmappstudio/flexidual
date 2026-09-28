import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  canSubmitCourseTask,
  getCourseTaskAccess,
} from "./model/course-task-access";
import { ensureCourseTaskRecipient } from "./model/course-task-recipients";
import { getUtcDayRange } from "../lib/time-zone";

const NOW = Date.UTC(2026, 8, 28, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const roles = [
      "teacher",
      "tutor",
      "student",
      "classmate",
      "admin",
      "foreignAdmin",
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
      createdBy: users.admin,
      createdAt: NOW,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdBy: users.admin,
      createdAt: NOW,
    });
    const foreignSchoolId = await ctx.db.insert("schools", {
      name: "Foreign School",
      slug: "foreign-school",
      isActive: true,
      createdBy: users.foreignAdmin,
      createdAt: NOW,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdBy: users.admin,
      createdAt: NOW,
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
    await ctx.db.insert("roleAssignments", {
      userId: users.foreignAdmin,
      role: "admin",
      orgType: "school",
      orgId: foreignSchoolId,
      schoolId: foreignSchoolId,
      assignedAt: NOW,
      assignedBy: users.foreignAdmin,
    });
    const classId = await ctx.db.insert("classes", {
      schoolId,
      campusId,
      curriculumId,
      teacherId: users.teacher,
      tutorId: users.tutor,
      name: "Math",
      isActive: true,
      endDate: NOW + 86_400_000,
      enrollmentsMigratedAt: NOW,
      createdBy: users.admin,
      createdAt: NOW,
    });
    for (const studentId of [users.student, users.classmate]) {
      await ctx.db.insert("classEnrollments", {
        classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: users.admin,
      });
    }
    const taskId = await ctx.db.insert("courseTasks", {
      classId,
      createdBy: users.teacher,
      title: "Fractions",
      releasedAt: NOW,
      dueAt: NOW + 3_600_000,
      allowLateSubmissions: false,
      updatedAt: NOW,
    });
    return { users, classId, taskId };
  });
  return { t, ...data };
}

test("recipient assignment is idempotent and requires current enrollment", async () => {
  const s = await setup();
  const recipientId = await s.t.run(async (ctx) => {
    const first = await ensureCourseTaskRecipient(
      ctx,
      s.taskId,
      s.users.student,
    );
    const second = await ensureCourseTaskRecipient(
      ctx,
      s.taskId,
      s.users.student,
    );
    expect(second).toBe(first);
    return first;
  });
  const recipients = await s.t.run((ctx) =>
    ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) =>
        q.eq("taskId", s.taskId).eq("studentId", s.users.student),
      )
      .take(2),
  );
  expect(recipients).toHaveLength(1);
  expect(recipients[0]).toMatchObject({
    _id: recipientId,
    submissionRevision: 0,
  });
  await expect(
    s.t.run((ctx) =>
      ensureCourseTaskRecipient(ctx, s.taskId, s.users.outsider),
    ),
  ).rejects.toThrow("INVALID_TASK_RECIPIENT");
});

test("only the assigned student and authorized staff can read a released task", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ensureCourseTaskRecipient(ctx, s.taskId, s.users.student),
  );
  const access = await s.t.run(async (ctx) => {
    const task = (await ctx.db.get("courseTasks", s.taskId))!;
    return await Promise.all(
      [
        s.users.teacher,
        s.users.admin,
        s.users.tutor,
        s.users.student,
        s.users.classmate,
        s.users.foreignAdmin,
        s.users.outsider,
      ].map((userId) => getCourseTaskAccess(ctx, task, userId)),
    );
  });
  expect(access.map((item) => item.kind)).toEqual([
    "manager",
    "manager",
    "none",
    "student",
    "none",
    "none",
    "none",
  ]);
  expect(access[3]).toMatchObject({
    recipient: { studentId: s.users.student },
  });
  await s.t.run(async (ctx) => {
    await ctx.db.patch("users", s.users.student, { isActive: false });
    const task = (await ctx.db.get("courseTasks", s.taskId))!;
    expect((await getCourseTaskAccess(ctx, task, s.users.student)).kind).toBe(
      "none",
    );
  });
});

test("scheduled tasks stay private and removal revokes access without deleting work", async () => {
  const s = await setup();
  const recipientId = await s.t.run((ctx) =>
    ensureCourseTaskRecipient(ctx, s.taskId, s.users.student),
  );
  await s.t.run(async (ctx) => {
    await ctx.db.patch("courseTasks", s.taskId, { releasedAt: undefined });
    const task = (await ctx.db.get("courseTasks", s.taskId))!;
    expect((await getCourseTaskAccess(ctx, task, s.users.student)).kind).toBe(
      "none",
    );
    expect((await getCourseTaskAccess(ctx, task, s.users.teacher)).kind).toBe(
      "manager",
    );
    await ctx.db.patch("courseTasks", s.taskId, { releasedAt: NOW });
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.delete("classEnrollments", enrollment!._id);
    const releasedTask = (await ctx.db.get("courseTasks", s.taskId))!;
    expect(
      (await getCourseTaskAccess(ctx, releasedTask, s.users.student)).kind,
    ).toBe("none");
    expect(
      await ctx.db.get("courseTaskRecipients", recipientId),
    ).not.toBeNull();
  });
});

test("course end blocks submissions but preserves historical read access", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ensureCourseTaskRecipient(ctx, s.taskId, s.users.student),
  );
  await s.t.run(async (ctx) => {
    const task = (await ctx.db.get("courseTasks", s.taskId))!;
    const course = (await ctx.db.get("classes", s.classId))!;
    expect(await canSubmitCourseTask(ctx, course, task, NOW)).toBe(true);
    expect(
      await canSubmitCourseTask(ctx, course, task, course.endDate! + 1),
    ).toBe(false);
    expect(
      await canSubmitCourseTask(
        ctx,
        { ...course, endDate: undefined },
        task,
        NOW,
      ),
    ).toBe(false);
    await ctx.db.patch("classes", s.classId, { isActive: false });
    expect((await getCourseTaskAccess(ctx, task, s.users.student)).kind).toBe(
      "student",
    );
    expect(
      await canSubmitCourseTask(ctx, { ...course, isActive: false }, task, NOW),
    ).toBe(false);
  });
});

test("undated courses use the academic period end in the course time zone", async () => {
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
      timeZone: "America/Bogota",
    });
    const undatedCourse = (await ctx.db.get("classes", s.classId))!;
    const task = {
      ...(await ctx.db.get("courseTasks", s.taskId))!,
      allowLateSubmissions: true,
    };
    const periodEndAt = getUtcDayRange("2026-09-30", "America/Bogota").to - 1;

    expect(await canSubmitCourseTask(ctx, undatedCourse, task, NOW)).toBe(true);
    expect(
      await canSubmitCourseTask(ctx, undatedCourse, task, periodEndAt),
    ).toBe(true);
    expect(
      await canSubmitCourseTask(ctx, undatedCourse, task, periodEndAt + 1),
    ).toBe(false);
    expect(
      await canSubmitCourseTask(
        ctx,
        { ...undatedCourse, endDate: NOW - 1 },
        task,
        NOW,
      ),
    ).toBe(false);
    await ctx.db.patch("campuses", course.campusId!, {
      timeZone: "America/Bogota",
    });
    await ctx.db.patch("academicPeriods", periodId, {
      endDate: Date.UTC(2026, 8, 30, 12),
    });
    expect(
      await canSubmitCourseTask(
        ctx,
        { ...undatedCourse, timeZone: undefined },
        task,
        periodEndAt,
      ),
    ).toBe(true);
    expect(
      await canSubmitCourseTask(
        ctx,
        { ...undatedCourse, timeZone: "Invalid/Zone" },
        task,
        NOW,
      ),
    ).toBe(false);
    await ctx.db.patch("academicPeriods", periodId, {
      endDate: "2026-09-31",
    });
    expect(await canSubmitCourseTask(ctx, undatedCourse, task, NOW)).toBe(
      false,
    );
  });
});

test("late submissions and manual closure follow the task settings", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    const task = (await ctx.db.get("courseTasks", s.taskId))!;
    const course = (await ctx.db.get("classes", s.classId))!;
    const afterDue = task.dueAt! + 1;
    expect(await canSubmitCourseTask(ctx, course, task, afterDue)).toBe(false);
    expect(
      await canSubmitCourseTask(
        ctx,
        course,
        { ...task, allowLateSubmissions: true },
        afterDue,
      ),
    ).toBe(true);
    expect(
      await canSubmitCourseTask(
        ctx,
        course,
        { ...task, dueAt: undefined },
        afterDue,
      ),
    ).toBe(true);
    expect(
      await canSubmitCourseTask(
        ctx,
        course,
        { ...task, allowLateSubmissions: true, manuallyClosedAt: NOW },
        afterDue,
      ),
    ).toBe(false);
  });
});
