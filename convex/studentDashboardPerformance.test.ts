import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { listActiveStudentClasses } from "./model/enrollments";
import { isUpcomingClassSession } from "../lib/class-session";
import aggregate from "@convex-dev/aggregate/test";
import { internal } from "./_generated/api";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { registerDashboardAttendanceTriggers } from "./model/dashboardAggregates";

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

test("enrollment lookup skips other campuses and migrated unrelated courses and retains missing/zero legacy rosters", async () => {
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
    for (let i = 0; i < 100; i++) {
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
      await ctx.db.insert("classes", {
        name: `Unscoped legacy ${i}`,
        description: "x".repeat(10_000),
        curriculumId: ids.curriculum,
        students: [ids.student],
        isActive: true,
        createdAt: FROM,
        createdBy: ids.teacher,
      });
    }
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

test("summary backfill is resumable, preserves totals and removes historical dashboard reads", async () => {
  const { t, ids, student } = await setup();
  aggregate.register(t, "dashboardAggregate");
  // Add source data directly, like data predating this release.
  await t.run(async (ctx) => {
    for (let i = 0; i < 100; i++)
      await ctx.db.insert("lessons", {
        curriculumId: ids.curriculum,
        title: `Heavy ${i}`,
        content: "x".repeat(20_000),
        order: i,
        isActive: true,
        createdAt: FROM,
        createdBy: ids.teacher,
      });
    const oldCourse = await ctx.db.insert("classes", {
      name: "Inactive history",
      curriculumId: ids.curriculum,
      campusId: ids.campus,
      isActive: false,
      createdAt: FROM,
      createdBy: ids.teacher,
    });
    for (let i = 0; i < 1000; i++) {
      const scheduleId = await ctx.db.insert("classSchedule", {
        classId: oldCourse,
        scheduledStart: FROM - i * 86400000,
        scheduledEnd: FROM - i * 86400000 + 3600000,
        roomName: `old-history-${i}`,
        status: "completed",
        createdAt: FROM,
        createdBy: ids.teacher,
      });
      await ctx.db.insert("studentAttendanceRecords", {
        scheduleId,
        studentId: ids.student,
        status: "present",
        confirmedBy: ids.teacher,
        confirmedAt: FROM,
        lastUpdatedBy: ids.teacher,
        lastUpdatedAt: FROM,
      });
    }
  });
  const baseline = await student.query(async (ctx) => {
    const data = await ctx.runQuery(api.student.getStudentDashboardStats, {});
    return { data, metrics: await ctx.meta.getTransactionMetrics() };
  });
  const before = baseline.data;
  const pendingBefore = before!.pendingAttendanceSessions.map(
    (row) => row.scheduleId,
  );
  let done = false;
  for (let i = 0; i < 500 && !done; i++)
    done = (await t.mutation(internal.dashboardSummaries.backfill, {})).done;
  expect(done).toBe(true);
  expect(
    (await t.mutation(internal.dashboardSummaries.backfill, {})).done,
  ).toBe(true);
  const read = await student.query(async (ctx) => {
    const data = await ctx.runQuery(api.student.getStudentDashboardStats, {
      summaryOnly: true,
    });
    return { data, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(read.data!.overall).toEqual(before!.overall);
  expect(read.data!.classes).toEqual(before!.classes);
  expect(read.data!.pendingAttendanceSessions).toEqual([]);
  console.log(
    "DASHBOARD_LIGHT_READ",
    JSON.stringify({
      documents: read.metrics.documentsRead.used,
      bytes: read.metrics.bytesRead.used,
      previousDocuments: baseline.metrics.documentsRead.used,
      previousBytes: baseline.metrics.bytesRead.used,
    }),
  );
  expect(read.metrics.documentsRead.used).toBeLessThan(128);
  expect(read.metrics.bytesRead.used).toBeLessThan(100_000);
  expect(read.metrics.bytesRead.used).toBeLessThan(
    baseline.metrics.bytesRead.used / 20,
  );
  const allPending = [];
  let cursor: string | null = null;
  for (let i = 0; i < 100; i++) {
    const page: FunctionReturnType<
      typeof api.student.listStudentPendingAttendance
    > = await student.query(api.student.listStudentPendingAttendance, {
      paginationOpts: { cursor, numItems: 25 },
    });
    allPending.push(...page.page.map((row) => row.scheduleId));
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(new Set(allPending)).toEqual(new Set(pendingBefore));
  expect(allPending.length).toBe(pendingBefore.length);
  await expect(
    t.query(api.student.listStudentPendingAttendance, {
      paginationOpts: { cursor: null, numItems: 25 },
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("attendance backfill bounds indirect schedule reads and preserves native resume cursors", async () => {
  const { t, ids, student } = await setup();
  aggregate.register(t, "dashboardAggregate");
  const before = await student.query(api.student.getStudentDashboardStats, {});
  for (let i = 0; i < 20; i++)
    await t.run(async (ctx) => {
      const scheduleId = await ctx.db.insert("classSchedule", {
        classId: ids.course,
        description: "x".repeat(850_000),
        scheduledStart: FROM,
        scheduledEnd: NOW,
        roomName: `large-attendance-${i}`,
        status: "completed",
        sessionClosureStatus: "completed",
        createdAt: FROM,
        createdBy: ids.teacher,
      });
      await ctx.db.insert("studentAttendanceRecords", {
        scheduleId,
        studentId: ids.student,
        status: "present",
        confirmedBy: ids.teacher,
        confirmedAt: FROM,
        lastUpdatedBy: ids.teacher,
        lastUpdatedAt: FROM,
      });
    });
  let done = false;
  let attendanceBatches = 0;
  let maxRead = 0;
  for (let i = 0; i < 100 && !done; i++) {
    const state = await t.run((ctx) =>
      ctx.db.query("dashboardSummaryState").unique(),
    );
    const batch = await t.mutation(async (ctx) => {
      const result = await ctx.runMutation(
        internal.dashboardSummaries.backfill,
        {},
      );
      return { ...result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    maxRead = Math.max(maxRead, batch.metrics.bytesRead.used);
    if (state?.phase === 1) attendanceBatches++;
    done = batch.done;
  }
  expect(done).toBe(true);
  expect(attendanceBatches).toBeGreaterThan(1);
  expect(maxRead).toBeLessThan(5 * 1024 * 1024);
  const after = await student.query(api.student.getStudentDashboardStats, {
    summaryOnly: true,
  });
  expect(after!.overall).toEqual({
    ...before!.overall,
    totalSessions: before!.overall.totalSessions + 20,
    verifiedSessions: before!.overall.verifiedSessions + 20,
    attendanceCounts: { ...before!.overall.attendanceCounts, present: 20 },
  });
  process.stdout.write(`Large-schedule backfill max bytesRead: ${maxRead}\n`);
});

test("transactional summaries follow correction, reopen, cancellation and deletion without drift", async () => {
  const { t, ids, student, teacher } = await setup();
  aggregate.register(t, "dashboardAggregate");
  const triggers = new Triggers<DataModel>();
  registerDashboardAttendanceTriggers(triggers);
  while (!(await t.mutation(internal.dashboardSummaries.backfill, {})).done) {
    /* explicit test-only initialization */
  }
  const parity = async () => {
    const reference = await student.query(
      api.student.getStudentDashboardStats,
      {},
    );
    const summary = await student.query(api.student.getStudentDashboardStats, {
      summaryOnly: true,
    });
    expect(summary!.overall).toEqual(reference!.overall);
    expect(summary!.classes.map((row) => row.stats)).toEqual(
      reference!.classes.map((row) => row.stats),
    );
  };
  const attendanceId = await t.run(async (raw) => {
    const ctx = triggers.wrapDB(raw);
    await ctx.db.patch("classSchedule", ids.closed, {
      sessionClosureStatus: "completed",
    });
    return ctx.db.insert("studentAttendanceRecords", {
      scheduleId: ids.closed,
      studentId: ids.student,
      status: "present",
      confirmedBy: ids.teacher,
      confirmedAt: FROM,
      lastUpdatedBy: ids.teacher,
      lastUpdatedAt: FROM,
    });
  });
  await parity();
  await teacher.mutation(api.schedule.updateAttendance, {
    scheduleId: ids.closed,
    studentId: ids.student,
    status: "excused",
    excuseReason: "Documented absence",
  });
  // Retrying an identical correction must not increment the counters again.
  await teacher.mutation(api.schedule.updateAttendance, {
    scheduleId: ids.closed,
    studentId: ids.student,
    status: "excused",
    excuseReason: "Documented absence",
  });
  expect(
    await t.run((ctx) => ctx.db.get("studentAttendanceRecords", attendanceId)),
  ).toMatchObject({ status: "excused" });
  await parity();
  await t.run(async (raw) =>
    triggers.wrapDB(raw).db.patch("classSchedule", ids.closed, {
      status: "active",
      sessionClosureStatus: "pending",
    }),
  );
  await parity();
  await t.run(async (raw) =>
    triggers.wrapDB(raw).db.patch("classSchedule", ids.closed, {
      status: "completed",
      sessionClosureStatus: "completed",
    }),
  );
  await parity();
  await t.run(async (raw) =>
    triggers
      .wrapDB(raw)
      .db.patch("classSchedule", ids.closed, { status: "cancelled" }),
  );
  await parity();
  await t.run(async (raw) =>
    triggers.wrapDB(raw).db.delete("classSchedule", ids.closed),
  );
  await parity();
});
