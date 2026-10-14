import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { listActiveStudentClasses } from "./model/enrollments";
import { isUpcomingClassSession } from "../lib/class-session";

const FROM = Date.UTC(2026, 9, 14);
const TO = FROM + 24 * 60 * 60_000 - 1;
const NOW = FROM + 12 * 60 * 60_000;

async function setup() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const ids = await t.run(async (ctx) => {
    const createUser = (clerkId: string) =>
      ctx.db.insert("users", {
        clerkId,
        firstName: clerkId,
        lastName: "Test",
        fullName: `${clerkId} Test`,
        isActive: true,
        createdAt: FROM,
      });
    const teacher = await createUser("cost-teacher");
    const student = await createUser("cost-student");
    const outsider = await createUser("cost-outsider");
    const school = await ctx.db.insert("schools", {
      name: "Cost School",
      slug: "cost-school",
      isActive: true,
      timeZone: "America/Bogota",
      createdAt: FROM,
      createdBy: teacher,
    });
    const campus = await ctx.db.insert("campuses", {
      schoolId: school,
      name: "Cost Campus",
      slug: "cost-campus",
      isActive: true,
      createdAt: FROM,
      createdBy: teacher,
    });
    for (const [userId, role] of [
      [teacher, "teacher"],
      [student, "student"],
    ] as const)
      await ctx.db.insert("roleAssignments", {
        userId,
        role,
        orgType: "campus",
        orgId: campus,
        schoolId: school,
        assignedAt: FROM,
        assignedBy: teacher,
      });
    const curriculum = await ctx.db.insert("curriculums", {
      schoolId: school,
      title: "Math",
      color: "#123456",
      isActive: true,
      createdAt: FROM,
      createdBy: teacher,
    });
    const course = await ctx.db.insert("classes", {
      name: "Math Course",
      curriculumId: curriculum,
      teacherId: teacher,
      campusId: campus,
      schoolId: school,
      timeZone: "America/Bogota",
      enrollmentsMigratedAt: FROM,
      students: [outsider],
      isActive: true,
      createdAt: FROM,
      createdBy: teacher,
    });
    await ctx.db.insert("classEnrollments", {
      classId: course,
      studentId: student,
      enrolledAt: FROM,
      enrolledBy: teacher,
    });
    const schedule = async (
      roomName: string,
      start: number,
      status: "scheduled" | "active" | "completed" | "cancelled",
      isLive = false,
    ) =>
      ctx.db.insert("classSchedule", {
        classId: course,
        scheduledStart: start,
        scheduledEnd: start + 60 * 60_000,
        roomName,
        status,
        isLive,
        sessionType: "live",
        createdAt: FROM,
        createdBy: teacher,
      });
    const today = await schedule("today", NOW, "scheduled");
    const expired = await schedule("expired-today", FROM, "scheduled");
    const extended = await schedule(
      "extended",
      FROM - 24 * 60 * 60_000,
      "active",
      true,
    );
    const closed = await schedule("closed", NOW, "completed");
    const cancelled = await schedule("cancelled", NOW, "cancelled");
    for (let i = 0; i < 200; i++) {
      await schedule(
        `past-${i}`,
        FROM - (i + 2) * 24 * 60 * 60_000,
        "completed",
      );
      await schedule(
        `future-${i}`,
        TO + (i + 2) * 24 * 60 * 60_000,
        "scheduled",
      );
    }
    return {
      teacher,
      student,
      outsider,
      school,
      campus,
      curriculum,
      course,
      today,
      expired,
      extended,
      closed,
      cancelled,
    };
  });
  return {
    t,
    ids,
    student: t.withIdentity({ subject: "cost-student" }),
    teacher: t.withIdentity({ subject: "cost-teacher" }),
  };
}

test("enrollment lookup skips migrated unrelated courses and retains missing/zero legacy rosters", async () => {
  const { t, ids, student } = await setup();
  const legacy = await t.run(async (ctx) => {
    const rows = [];
    for (const timestamp of [undefined, 0])
      rows.push(
        await ctx.db.insert("classes", {
          name: "Legacy",
          curriculumId: ids.curriculum,
          campusId: ids.campus,
          students: [ids.student],
          enrollmentsMigratedAt: timestamp,
          isActive: true,
          createdAt: FROM,
          createdBy: ids.teacher,
        }),
      );
    for (let i = 0; i < 100; i++)
      await ctx.db.insert("classes", {
        name: `Unrelated ${i}`,
        description: "x".repeat(10_000),
        curriculumId: ids.curriculum,
        students: [ids.student],
        enrollmentsMigratedAt: FROM,
        isActive: true,
        createdAt: FROM,
        createdBy: ids.teacher,
      });
    return rows;
  });
  const read = await student.query(async (ctx) => {
    const courses = await listActiveStudentClasses(
      ctx,
      ids.student,
      ids.campus,
    );
    return {
      ids: courses.map((course) => course._id),
      metrics: await ctx.meta.getTransactionMetrics(),
    };
  });
  expect(read.ids).toEqual([ids.course, ...legacy]);
  expect(read.metrics.documentsRead.used).toBeLessThan(10);
  expect(read.metrics.bytesRead.used).toBeLessThan(10_000);
  const schedules = await student.query(api.schedule.getMySchedule, {
    now: NOW,
    from: FROM,
    to: TO,
  });
  expect(new Set(schedules.map((event) => event.scheduleId))).toEqual(
    new Set([ids.today, ids.expired, ids.closed, ids.cancelled]),
  );
});

test("daily profile schedule retains late live sessions, filters locally and avoids full histories", async () => {
  const { t, ids, teacher } = await setup();
  const target = { studentId: ids.student, orgSlug: "cost-campus" };
  const read = await teacher.query(async (ctx) => {
    const events = await ctx.runQuery(api.student.getStudentDashboardSchedule, {
      ...target,
      from: FROM,
      to: TO,
    });
    return { events, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(read.events?.map((event) => event.scheduleId)).toEqual([
    ids.extended,
    ids.expired,
    ids.today,
  ]);
  expect(read.metrics.documentsRead.used).toBeLessThan(70);
  const legacy = await teacher.query(api.student.getStudentDashboardStats, {
    ...target,
    now: NOW,
  });
  const visible = read.events!.filter((event) =>
    isUpcomingClassSession(event, event.end, NOW),
  );
  expect(visible).toEqual(
    legacy!.upcomingLessons.filter(
      (event) => (event.start >= FROM && event.start <= TO) || event.isLive,
    ),
  );
  const stable = await teacher.query(
    api.student.getStudentDashboardStats,
    target,
  );
  expect(stable!.overall).toEqual(legacy!.overall);
  expect(stable!.pendingAttendanceSessions).toEqual(
    legacy!.pendingAttendanceSessions,
  );
  expect(stable!.classes[0].courseProgress).toEqual(
    legacy!.classes[0].courseProgress,
  );
  expect(stable!.upcomingLessons).toEqual([]);
  expect(
    await t
      .withIdentity({ subject: "cost-outsider" })
      .query(api.student.getStudentDashboardSchedule, {
        ...target,
        from: FROM,
        to: TO,
      }),
  ).toBeNull();
  expect(
    await t.query(api.student.getStudentDashboardSchedule, {
      ...target,
      from: FROM,
      to: TO,
    }),
  ).toBeNull();
  await expect(
    teacher.query(api.student.getStudentDashboardSchedule, {
      ...target,
      from: FROM,
      to: TO + 3 * 24 * 60 * 60_000,
    }),
  ).rejects.toThrow("INVALID_DATE_RANGE");
  expect(
    (await teacher.query(api.student.getStudentDashboardSchedule, {
      ...target,
      from: TO + 1,
      to: TO + 24 * 60 * 60_000,
    }))!.map((event) => event.scheduleId),
  ).toEqual([ids.extended]);
});

test("active-only chat schedule reads only active rows and keeps closed/history reads available", async () => {
  const { ids, student } = await setup();
  const read = await student.query(async (ctx) => {
    const events = await ctx.runQuery(api.schedule.getMySchedule, {
      classId: ids.course,
      now: NOW,
      status: "active",
    });
    return { events, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(read.events.map((event) => event.scheduleId)).toEqual([ids.extended]);
  expect(read.metrics.documentsRead.used).toBeLessThan(60);
  const all = await student.query(api.schedule.getMySchedule, {
    classId: ids.course,
    now: NOW,
  });
  expect(all).toHaveLength(405);
});
