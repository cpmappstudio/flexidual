import aggregate from "@convex-dev/aggregate/test";
import presence from "@convex-dev/presence/test";
import { Triggers } from "convex-helpers/server/triggers";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import {
  DASHBOARD_READ_BUDGET,
  DASHBOARD_REFRESH_READ_BUDGET,
} from "./adminSessionDashboard";
import schema from "./schema";
import {
  syncDashboardLesson,
  syncDashboardTaughtLesson,
} from "./model/courseProgressSummary";
import { registerCourseSessionWeekTriggers } from "./model/courseSessionWeekRefresh";
import { modules } from "./test.setup";
import { addCivilDays } from "../lib/time-zone";

const weekStart = "2026-10-12";
const first = Date.parse("2026-10-12T06:00:00Z"); // Monday in Tegucigalpa.
const weekMs = 7 * 86_400_000;
const read = api.adminSessionDashboard.getWeeklySessions;
const courses = api.adminSessionDashboard.listCourses;
const progress = api.adminSessionDashboard.getCourseProgress;
const review = api.adminSessionDashboard.listReviewSessions;
const detail = api.adminSessionDashboard.getReviewRecord;
const refresh = internal.adminSessionDashboard.refreshWeek;
const refreshPending = internal.adminSessionDashboard.refreshNextPendingWeek;
const initializeHistory = internal.adminSessionDashboard.initializeWeeklyHistory;
const weekTriggers = new Triggers<DataModel>();
registerCourseSessionWeekTriggers(weekTriggers);

const quietTime = new Date("2026-11-12T09:00:00Z"); // 03:00 in Tegucigalpa.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(quietTime);
});
afterEach(() => vi.useRealTimers());

async function fixture() {
  const t = convexTest({ schema, modules, transactionLimits: true });
  const ids = await t.run(async ({ db }) => {
    const makeUser = (role: string, isActive = true) =>
      db.insert("users", {
        clerkId: role,
        firstName: role,
        lastName: "Test",
        fullName: role,
        isActive,
        createdAt: 0,
      });
    const admin = await makeUser("admin");
    const common = { createdAt: 0, createdBy: admin };
    const active = { ...common, isActive: true };
    const makeInstitution = async (name: string) => {
      const schoolId = await db.insert("schools", {
        ...active,
        name,
        slug: name,
        timeZone: "America/Tegucigalpa",
      });
      const academicPeriodId = await db.insert("academicPeriods", {
        ...common,
        schoolId,
        name,
        startDate: "2026-08-01",
        endDate: "2027-05-31",
      });
      const curriculumId = await db.insert("curriculums", {
        ...active,
        schoolId,
        title: name,
      });
      const campus = (slug: string) =>
        db.insert("campuses", { ...active, name: slug, slug, schoolId });
      const campusId = await campus(name);
      const otherCampusId = await campus(name + "-other");
      const course = (campusId: Id<"campuses">) =>
        db.insert("classes", {
          ...active,
          name,
          schoolId,
          campusId,
          academicPeriodId,
          curriculumId,
        });
      return {
        schoolId,
        academicPeriodId,
        campusId,
        otherCampusId,
        curriculumId,
        classId: await course(campusId),
        otherClassId: await course(otherCampusId),
      };
    };
    const local = await makeInstitution("local");
    const foreign = await makeInstitution("foreign");
    const principal = await makeUser("principal");
    const principalAssignment = await db.insert("roleAssignments", {
      userId: principal,
      role: "principal",
      orgType: "campus",
      orgId: local.campusId,
      schoolId: local.schoolId,
      assignedAt: 0,
      assignedBy: admin,
    });
    for (const role of [
      "admin",
      "teacher",
      "tutor",
      "student",
      "inactive",
      "superadmin",
    ] as const) {
      const userId =
        role === "admin" ? admin : await makeUser(role, role !== "inactive");
      const system = role === "superadmin";
      const institution = role === "admin" || role === "inactive";
      await db.insert("roleAssignments", {
        userId,
        role: institution ? "admin" : role,
        orgType: system ? "system" : institution ? "school" : "campus",
        ...(system
          ? {}
          : {
              orgId: institution ? local.schoolId : local.campusId,
              schoolId: local.schoolId,
            }),
        ...(role === "student" ? { gradeCode: "10" } : {}),
        assignedAt: 0,
        assignedBy: admin,
      });
    }
    return { ...local, foreign, admin, principalAssignment };
  });
  const as = (subject: string) => t.withIdentity({ subject });
  const args = { academicPeriodId: ids.academicPeriodId, weekStart };
  const insertSchedule = (
    classId: Id<"classes">,
    overrides: Partial<Doc<"classSchedule">> = {},
  ) =>
    t.run(({ db }) =>
      db.insert("classSchedule", {
        classId,
        scheduledStart: first,
        scheduledEnd: first + 3600_000,
        roomName: "test",
        status: "scheduled",
        createdAt: 0,
        createdBy: ids.admin,
        ...overrides,
      }),
    );
  return { t, as, args, insertSchedule, ...ids };
}

test("counts unique active accounts and existing online presence only within the authorized scope", async () => {
  const f = await fixture();
  presence.register(f.t);
  const studentId = await f.t.run(async ({ db }) => {
    const student = (await db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", "student"))
      .unique())!;
    for (const [campusId, role] of [
      [f.campusId, "tutor"],
      [f.otherCampusId, "student"],
      [f.foreign.campusId, "student"],
    ] as const) {
      await db.insert("roleAssignments", {
        userId: student._id,
        orgId: campusId,
        orgType: "campus",
        role,
        assignedAt: 0,
      });
    }
    return student._id;
  });
  const beat = (sessionId: string) =>
    f.as("student").mutation(api.presence.heartbeat, {
      roomId: studentId,
      userId: studentId,
      sessionId,
      interval: 30_000,
    });
  const firstTab = await beat("first");
  const secondTab = await beat("second");
  const snapshot = api.adminSessionDashboard.getPeopleSnapshot;
  const school = { schoolId: f.schoolId };
  const campus = { ...school, campusId: f.campusId };
  const principal = f.as("principal");
  expect(await principal.query(snapshot, campus)).toEqual({
    total: 4,
    online: 1,
  });
  expect(await f.as("admin").query(snapshot, school)).toEqual({
    total: 5,
    online: 1,
  });
  await expect(principal.query(snapshot, school)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await expect(
    principal.query(snapshot, { ...school, campusId: f.otherCampusId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    principal.query(snapshot, { ...school, campusId: f.foreign.campusId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(f.as("teacher").query(snapshot, campus)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await f.t.mutation(api.presence.disconnect, {
    sessionToken: firstTab.sessionToken,
  });
  expect((await principal.query(snapshot, campus)).online).toBe(1);
  await f.t.mutation(api.presence.disconnect, {
    sessionToken: secondTab.sessionToken,
  });
  expect(await principal.query(snapshot, campus)).toEqual({
    total: 4,
    online: 0,
  });
});

test("measures scoped presence during a sign-in burst and rejects an oversized directory", async () => {
  const f = await fixture();
  presence.register(f.t);
  const addMembers = (count: number, name: string) =>
    f.t.run(async ({ db }) => {
      const members = [];
      for (let i = 0; i < count; i++) {
        const subject = `member-${name.length}-${i}`;
        const userId = await db.insert("users", {
          clerkId: subject,
          firstName: name,
          lastName: "Test",
          fullName: `${name} Test`,
          createdAt: 0,
          isActive: true,
        });
        await db.insert("roleAssignments", {
          userId,
          orgType: "campus",
          orgId: f.campusId,
          role: "student",
          assignedAt: 0,
        });
        members.push({ userId, subject });
      }
      return members;
    });
  const members = await addMembers(300, "Student");
  const scope = { schoolId: f.schoolId, campusId: f.campusId };
  const admin = f.as("admin");
  const measure = () => admin.run(async (ctx) => {
    const result = await ctx.runQuery(
      api.adminSessionDashboard.getPeopleSnapshot,
      scope,
    );
    return {
      result,
      bytes: (await ctx.meta.getTransactionMetrics()).bytesRead.used,
    };
  });
  const { result, bytes } = await measure();
  expect(result).toEqual({ total: 304, online: 0 });
  expect(bytes).toBeLessThan(DASHBOARD_READ_BUDGET);
  process.stdout.write(
    `Dashboard people snapshot bytesRead (304 accounts): ${bytes}\n`,
  );
  let burstBytes = 0;
  let peakBytes = bytes;
  // Separate reads model connections arriving in different query versions.
  for (const [i, { userId, subject }] of members.slice(0, 30).entries()) {
    await f.as(subject).mutation(api.presence.heartbeat, {
      roomId: userId,
      userId,
      sessionId: "first-tab",
      interval: 30_000,
    });
    const after = await measure();
    expect(after.result).toEqual({ total: 304, online: i + 1 });
    expect(after.bytes).toBeLessThan(DASHBOARD_READ_BUDGET);
    burstBytes += after.bytes;
    peakBytes = Math.max(peakBytes, after.bytes);
  }
  process.stdout.write(
    `Dashboard presence burst: ${burstBytes} bytesRead across 30 snapshots; peak ${peakBytes}\n`,
  );
  await addMembers(40, "X".repeat(4_000));
  await expect(
    admin.query(api.adminSessionDashboard.getPeopleSnapshot, scope),
  ).rejects.toThrow(/read|bytes/i);
}, 15_000);

test("returns the institution timezone independently of the campus timezone", async () => {
  const f = await fixture();
  await f.t.run(({ db }) =>
    db.patch("campuses", f.campusId, { timeZone: "America/Bogota" }),
  );
  const settings = () =>
    f.as("principal").query(api.academicSettings.get, {
      schoolId: f.schoolId,
      campusId: f.campusId,
    });
  expect(await settings()).toMatchObject({
    timeZone: "America/Bogota",
    institutionTimeZone: "America/Tegucigalpa",
  });
  await f.t.run(({ db }) =>
    db.patch("schools", f.schoolId, { timeZone: "UTC" }),
  );
  expect(await settings()).toMatchObject({
    timeZone: "America/Bogota",
    institutionTimeZone: "UTC",
  });
});

test("counts distinct active curriculum lessons and elapsed scheduled time in the institutional day", async () => {
  const f = await fixture();
  aggregate.register(f.t, "dashboardAggregate");
  const hour = 3_600_000;
  const monday = first + weekMs;
  const scheduleId = await f.insertSchedule(f.classId, {
    status: "completed",
    sessionStartedAt: first + hour / 2,
    completedAt: first + hour / 2 + 1000,
  });
  const repeatScheduleId = await f.insertSchedule(f.classId, {
    status: "completed",
    scheduledStart: first + 86_400_000,
    scheduledEnd: first + 86_400_000 + hour,
  });
  await f.insertSchedule(f.classId, {
    sessionType: "abeka",
    scheduledStart: monday - 3 * hour,
    scheduledEnd: monday - hour,
  });
  await f.insertSchedule(f.classId, {
    scheduledStart: monday,
    scheduledEnd: monday + 3 * hour,
  });
  await f.insertSchedule(f.classId, { status: "cancelled" });
  await f.insertSchedule(f.classId, {
    scheduledStart: first - 90 * 86_400_000,
    scheduledEnd: first - 90 * 86_400_000 + hour,
  });
  const args = {
    academicPeriodId: f.academicPeriodId,
    campusId: f.campusId,
    classIds: [f.classId],
    today: "2026-10-19",
  };
  const principal = f.as("principal");
  const timetable = { elapsedMs: 4 * hour, totalMs: 7 * hour };
  expect(await principal.query(progress, args)).toEqual([
    { classId: f.classId, lessons: null, timetable },
  ]);
  await f.t.run(async (ctx) => {
    await ctx.db.insert("dashboardSummaryState", {
      key: "v1",
      ready: true,
      phase: 0,
      cursor: null,
    });
    const reportId = await ctx.db.insert("classSessionReports", {
      classId: f.classId,
      scheduleId,
      closedAt: first,
      closedBy: f.admin,
    });
    const repeatReportId = await ctx.db.insert("classSessionReports", {
      classId: f.classId,
      scheduleId: repeatScheduleId,
      closedAt: first + 86_400_000,
      closedBy: f.admin,
    });
    for (let order = 0; order < 3; order++) {
      const lessonId = await ctx.db.insert("lessons", {
        title: `Lesson ${order}`,
        curriculumId: f.curriculumId,
        order,
        isActive: order !== 2,
        createdAt: first,
        createdBy: f.admin,
      });
      await syncDashboardLesson(ctx, (await ctx.db.get("lessons", lessonId))!);
      if (order === 1) continue;
      const source = { classId: f.classId, scheduleId, lessonId };
      await ctx.db.insert("classSessionReportLessons", { ...source, reportId });
      await ctx.db.insert("classSessionReportLessons", {
        ...source,
        reportId: repeatReportId,
        scheduleId: repeatScheduleId,
      });
      await ctx.db.insert("classPrerecordedLessonRecords", {
        ...source,
        taughtAt: first,
      });
      await syncDashboardTaughtLesson(ctx, f.classId, lessonId);
      await syncDashboardTaughtLesson(ctx, f.classId, lessonId);
    }
  });
  expect(await principal.query(progress, args)).toEqual([
    {
      classId: f.classId,
      timetable,
      lessons: {
        totalLessons: 2,
        taughtLessons: 1,
        pendingLessons: 1,
        percentage: 50,
      },
    },
  ]);
  await expect(
    principal.query(progress, {
      ...args,
      classIds: [f.classId, f.otherClassId],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.as("admin").query(progress, {
      ...args,
      campusId: undefined,
      classIds: [f.foreign.classId],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  for (const role of ["teacher", "tutor", "student"]) {
    await expect(f.as(role).query(progress, args)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
  }
  expect(
    await f.as("admin").query(progress, {
      ...args,
      campusId: undefined,
      classIds: [f.otherClassId],
    }),
  ).toEqual([
    {
      classId: f.otherClassId,
      timetable: null,
      lessons: {
        totalLessons: 2,
        taughtLessons: 0,
        pendingLessons: 2,
        percentage: 0,
      },
    },
  ]);
  await f.t.run(({ db }) =>
    db.delete("roleAssignments", f.principalAssignment),
  );
  await expect(principal.query(progress, args)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
});

test("uses the institutional DST boundary and excludes cancelled and out-of-period slots", async () => {
  const f = await fixture();
  await f.t.run(async ({ db }) => {
    await db.patch("schools", f.schoolId, { timeZone: "America/Santiago" });
    await db.patch("campuses", f.campusId, { timeZone: "UTC" });
    await db.patch("academicPeriods", f.academicPeriodId, {
      startDate: "2026-09-05",
      endDate: "2026-09-06",
    });
  });
  const slot = (
    start: string,
    end: string,
    status: "scheduled" | "cancelled" = "scheduled",
  ) =>
    f.insertSchedule(f.classId, {
      scheduledStart: Date.parse(start),
      scheduledEnd: Date.parse(end),
      status,
    });
  await slot("2026-09-05T03:00Z", "2026-09-05T04:00Z");
  await slot("2026-09-06T03:30Z", "2026-09-06T04:30Z");
  await slot("2026-09-06T04:00Z", "2026-09-06T05:00Z", "cancelled");
  await slot("2026-09-07T02:30Z", "2026-09-07T03:30Z");
  await slot("2026-09-07T03:00Z", "2026-09-07T04:00Z");
  const args = {
    academicPeriodId: f.academicPeriodId,
    campusId: f.campusId,
    classIds: [f.classId],
  };
  const principal = f.as("principal");
  expect(
    (await principal.query(progress, { ...args, today: "2026-09-06" }))[0]
      .timetable,
  ).toEqual({ elapsedMs: 1_800_000, totalMs: 5_400_000 });
  expect(
    (await principal.query(progress, { ...args, today: "2026-09-07" }))[0]
      .timetable,
  ).toEqual({ elapsedMs: 5_400_000, totalMs: 5_400_000 });
});

test("bounds progress reads for two courses and does not return a partial timetable", async () => {
  const f = await fixture();
  aggregate.register(f.t, "dashboardAggregate");
  await f.t.run(async (ctx) => {
    await ctx.db.insert("dashboardSummaryState", {
      key: "v1",
      ready: true,
      phase: 0,
      cursor: null,
    });
    for (let order = 0; order < 150; order++) {
      const lessonId = await ctx.db.insert("lessons", {
        title: `Lesson ${order}`,
        curriculumId: f.curriculumId,
        order,
        isActive: true,
        createdAt: first,
        createdBy: f.admin,
      });
      await syncDashboardLesson(ctx, (await ctx.db.get("lessons", lessonId))!);
    }
  });
  const classIds = [f.classId, f.otherClassId];
  const hour = 3_600_000;
  const readProgress = () =>
    f.as("admin").run(async (ctx) => ({
      result: await ctx.runQuery(progress, {
        academicPeriodId: f.academicPeriodId,
        classIds,
        today: "2026-10-19",
      }),
      metrics: await ctx.meta.getTransactionMetrics(),
    }));
  for (const classId of classIds) {
    await f.t.run(async ({ db }) => {
      for (let i = 0; i < 162; i++) {
        const scheduledStart = first + i * 86_400_000;
        await db.insert("classSchedule", {
          classId,
          scheduledStart,
          scheduledEnd: scheduledStart + hour,
          roomName: `course-${classId}-${scheduledStart}`,
          status: "completed",
          sessionStartedAt: scheduledStart,
          sessionStartedBy: f.admin,
          completedAt: scheduledStart + hour,
          sessionClosureStatus: "completed",
          sessionClosedBy: f.admin,
          sessionClosedAt: scheduledStart + hour,
          createdAt: 0,
          createdBy: f.admin,
        });
      }
    });
  }
  const { result, metrics } = await readProgress();
  expect(result.map(({ lessons }) => lessons?.totalLessons)).toEqual([
    150, 150,
  ]);
  expect(result.map(({ timetable }) => timetable)).toEqual(
    classIds.map(() => ({ elapsedMs: 7 * hour, totalMs: 162 * hour })),
  );
  expect(metrics.bytesRead.used).toBeLessThan(DASHBOARD_READ_BUDGET);
  expect(metrics.documentsWritten.used).toBe(0);
  process.stdout.write(
    `Dashboard academic progress bytesRead (2 × 162 sessions): ${metrics.bytesRead.used}\n`,
  );
  await f.insertSchedule(f.classId, {
    status: "cancelled",
    cancellationReason: "x".repeat(110 * 1024),
  });
  const oversized = await readProgress();
  expect(oversized.result[0].timetable).toBeNull();
  expect(oversized.result[1].timetable).toEqual(result[1].timetable);
  expect(oversized.metrics.bytesRead.used).toBeLessThan(DASHBOARD_READ_BUDGET);
  await f.insertSchedule(f.classId, {
    scheduledStart: first - hour,
    scheduledEnd: first,
    description: "x".repeat(DASHBOARD_READ_BUDGET),
  });
  await expect(readProgress()).rejects.toThrow(/read too much data/i);
});

test("filters courses and review details to the same administrative scope", async () => {
  const f = await fixture();
  const { academicPeriodId, weekStart } = f.args;
  const scope = { academicPeriodId, campusId: f.campusId };
  const window = {
    ...scope,
    weekStart,
    weekEnd: addCivilDays(weekStart, 7),
    cursor: null,
  };
  const completed = await f.insertSchedule(f.classId, {
    status: "completed",
    sessionStartedAt: first,
    completedAt: first + 2000,
    sessionClosureStatus: "pending",
  });
  const neverStarted = await f.insertSchedule(f.classId);
  const otherCampus = await f.insertSchedule(f.otherClassId);
  const foreign = await f.insertSchedule(f.foreign.classId);
  await f.insertSchedule(f.classId, { status: "active", isLive: true });
  await f.insertSchedule(f.classId, { status: "scheduled", isLive: true });
  await f.insertSchedule(f.classId, { status: "cancelled" });
  await f.insertSchedule(f.classId, {
    status: "completed",
    sessionClosureStatus: "completed",
  });
  await f.insertSchedule(f.classId, { sessionType: "abeka" });
  await f.insertSchedule(f.classId, {
    scheduledStart: first + weekMs,
    scheduledEnd: first + weekMs + 1000,
  });

  const principal = f.as("principal");
  expect(await principal.query(courses, scope)).toEqual([
    { classId: f.classId, name: "local", isActive: true },
  ]);
  const principalReview = await principal.query(review, window);
  expect(
    principalReview.rows.map(({ scheduleId, reason }) => [scheduleId, reason]),
  ).toEqual([
    [neverStarted, "noStart"],
    [completed, "reportPending"],
  ]);
  expect(principalReview.nextCursor).toBeNull();
  expect(
    await principal.query(detail, { ...scope, scheduleId: completed }),
  ).toMatchObject({
    state: "pending",
    scheduleId: completed,
    canCompleteReport: true,
  });
  for (const scheduleId of [otherCampus, foreign])
    await expect(
      principal.query(detail, { ...scope, scheduleId }),
    ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    principal.query(review, { ...window, classId: f.otherClassId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const institutionWindow = { ...window, campusId: undefined };
  const admin = f.as("admin");
  expect(
    (await admin.query(courses, { academicPeriodId })).map(
      ({ classId }) => classId,
    ),
  ).toEqual([f.classId, f.otherClassId]);
  expect(
    (await admin.query(review, institutionWindow)).rows.map(
      ({ scheduleId }) => scheduleId,
    ),
  ).toContain(otherCampus);
  expect(
    (await admin.query(review, { ...institutionWindow, classId: f.classId }))
      .rows,
  ).toEqual(principalReview.rows);
  for (const role of ["teacher", "tutor", "student"]) {
    const viewer = f.as(role);
    await expect(viewer.query(courses, scope)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
    await expect(viewer.query(review, window)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
    await expect(
      viewer.query(detail, { ...scope, scheduleId: completed }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
  await f.t.run(({ db }) =>
    db.delete("roleAssignments", f.principalAssignment),
  );
  await expect(principal.query(review, window)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await expect(
    principal.query(detail, { ...scope, scheduleId: completed }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("paginates review rows with equal timestamps without losing rows", async () => {
  const f = await fixture();
  const args = { ...f.args, weekEnd: addCivilDays(weekStart, 7) };
  const ids = [];
  for (let i = 0; i < 23; i++) {
    ids.push(await f.insertSchedule(i % 2 === 0 ? f.classId : f.otherClassId));
  }
  const admin = f.as("admin");
  const page = await admin.query(review, { ...args, cursor: null });
  expect(page.rows).toHaveLength(20);
  expect(page.nextCursor).not.toBeNull();
  const tail = await admin.query(review, { ...args, cursor: page.nextCursor });
  expect(tail.rows).toHaveLength(3);
  expect(tail.nextCursor).toBeNull();
  expect(
    new Set([...page.rows, ...tail.rows].map(({ scheduleId }) => scheduleId)),
  ).toEqual(new Set(ids));
});

test("refuses over-budget dashboard reads instead of returning incomplete data", async () => {
  const f = await fixture();
  const scheduleId = await f.insertSchedule(f.classId, {
    description: "x".repeat(DASHBOARD_READ_BUDGET),
  });
  const admin = f.as("admin");
  await expect(
    admin.query(review, {
      ...f.args,
      classId: f.classId,
      weekEnd: addCivilDays(weekStart, 7),
      cursor: null,
    }),
  ).rejects.toThrow(/read too much data/i);
  await expect(
    admin.query(detail, { academicPeriodId: f.academicPeriodId, scheduleId }),
  ).rejects.toThrow(/read too much data|DASHBOARD_READ_BUDGET_EXCEEDED/i);

  const normalScheduleId = await f.insertSchedule(f.classId);
  await f.t.run(({ db }) =>
    db.insert("classSessionReports", {
      scheduleId: normalScheduleId,
      closedBy: f.admin,
      closedAt: first + 3600_000,
      notes: "x".repeat(DASHBOARD_READ_BUDGET),
    }),
  );
  await expect(
    admin.query(detail, {
      academicPeriodId: f.academicPeriodId,
      scheduleId: normalScheduleId,
    }),
  ).rejects.toThrow(/read too much data|DASHBOARD_READ_BUDGET_EXCEEDED/i);

  await f.t.run(({ db }) =>
    db.patch("classes", f.classId, {
      description: "x".repeat(DASHBOARD_READ_BUDGET),
    }),
  );
  await expect(
    admin.query(courses, { academicPeriodId: f.academicPeriodId }),
  ).rejects.toThrow(/read too much data/i);
});

test("counts only live occurrences in institutional weeks and distinguishes empty from not refreshed", async () => {
  const f = await fixture();
  await f.t.run(({ db }) =>
    db.patch("classes", f.classId, {
      gradeCode: "10",
      gradeAssignments: [{ gradeCode: "10" }, { gradeCode: "12" }],
    }),
  );
  const completed = {
    status: "completed" as const,
    sessionStartedAt: first,
    completedAt: first + 1000,
    sessionClosureStatus: "pending" as const,
  };
  const reopened = await f.insertSchedule(f.classId, completed);
  await f.insertSchedule(f.classId, {
    status: "cancelled",
    sessionType: "live",
  });
  await f.insertSchedule(f.classId, { prerecordedVideoReleased: true });
  await f.insertSchedule(f.classId, {
    status: "completed",
    completedAt: first,
  });
  await f.insertSchedule(f.classId, { ...completed, sessionType: "abeka" });
  await f.insertSchedule(f.classId, { ...completed, sessionType: "ignitia" });
  await f.insertSchedule(f.classId, {
    ...completed,
    scheduledStart: first - 1,
  });
  await f.insertSchedule(f.classId, { scheduledStart: first + weekMs });
  await f.insertSchedule(f.otherClassId);
  await f.insertSchedule(f.foreign.classId, completed);
  expect((await f.as("admin").query(read, f.args)).weeks[0].counts).toBeNull();
  await f.t.mutation(refresh, f.args);
  await f.t.mutation(refresh, {
    ...f.args,
    weekStart: addCivilDays(weekStart, 7),
  });
  await f.t.mutation(refresh, {
    ...f.args,
    weekStart: addCivilDays(weekStart, 14),
  });
  const summary = () => f.as("admin").query(read, f.args);
  const result = await summary();
  expect(result.timeZone).toBe("America/Tegucigalpa");
  expect(result.weeks.map((row) => row.counts)).toEqual([
    { scheduled: 5, completed: 1, cancelled: 1, noStart: 2, other: 1 },
    { scheduled: 1, completed: 0, cancelled: 0, noStart: 1, other: 0 },
    { scheduled: 0, completed: 0, cancelled: 0, noStart: 0, other: 0 },
    null,
  ]);
  const scoped = await f
    .as("principal")
    .query(read, { ...f.args, campusId: f.campusId, classId: f.classId });
  expect(scoped.weeks[0].counts?.scheduled).toBe(4);
  await f.t.run(({ db }) =>
    db.patch("classSchedule", reopened, {
      status: "active",
      completedAt: undefined,
      sessionReopenedAt: first + 1001,
    }),
  );
  await f.t.mutation(refresh, f.args);
  expect((await summary()).weeks[0].counts).toMatchObject({
    completed: 0,
    other: 2,
  });
  await f.t.run(({ db }) =>
    db.patch("classSchedule", reopened, {
      status: "completed",
      completedAt: first + 3000,
    }),
  );
  await f.t.mutation(refresh, f.args);
  expect((await summary()).weeks[0].counts).toEqual(result.weeks[0].counts);
  await f.t.run(({ db }) => db.delete("classes", f.otherClassId));
  await f.t.mutation(refresh, f.args);
  expect((await summary()).weeks[0].counts?.scheduled).toBe(4);
  await f.t.run(({ db }) =>
    db.patch("schools", f.schoolId, { timeZone: "America/Bogota" }),
  );
  expect((await summary()).weeks.every((row) => row.counts === null)).toBe(
    true,
  );
});

test("counts only explicit attendance in closed Classroom reports, in scope and within the institutional period", async () => {
  const f = await fixture();
  const verified = {
    status: "completed",
    sessionClosureStatus: "completed",
  } as const;
  const statuses = ["present", "partial", "absent", "excused"] as const;
  const inPeriod = {
    scheduledStart: first + 86_400_000,
    scheduledEnd: first + 90_000_000,
  };
  const main = await f.insertSchedule(f.classId, { ...verified, ...inPeriod });
  const other = await f.insertSchedule(f.otherClassId, {
    ...verified,
    ...inPeriod,
  });
  const excluded = [
    await f.insertSchedule(f.classId, {
      ...verified,
      ...inPeriod,
      sessionClosureStatus: "pending",
    }),
    await f.insertSchedule(f.classId, {
      ...verified,
      ...inPeriod,
      status: "active",
    }),
    await f.insertSchedule(f.classId, {
      ...verified,
      ...inPeriod,
      status: "cancelled",
    }),
    await f.insertSchedule(f.classId, {
      ...verified,
      ...inPeriod,
      sessionType: "abeka",
    }),
    await f.insertSchedule(f.classId, {
      ...inPeriod,
      prerecordedVideoReleased: true,
    }),
    await f.insertSchedule(f.classId, verified),
    await f.insertSchedule(f.foreign.classId, { ...verified, ...inPeriod }),
  ];
  await f.t.run(async ({ db }) => {
    await db.patch("academicPeriods", f.academicPeriodId, {
      startDate: "2026-10-13",
    });
    await db.insert("courseSessionWeekRefreshes", {
      academicPeriodId: f.academicPeriodId,
      weekStart,
      timeZone: "America/Tegucigalpa",
      refreshedAt: +quietTime - 1,
    });
    const record = (
      scheduleId: Id<"classSchedule">,
      studentId: Id<"users">,
      status: (typeof statuses)[number],
    ) =>
      db.insert("studentAttendanceRecords", {
        scheduleId,
        studentId,
        status,
        confirmedBy: f.admin,
        confirmedAt: first,
        lastUpdatedBy: f.admin,
        lastUpdatedAt: first,
      });
    for (const status of statuses) {
      const studentId = await db.insert("users", {
        clerkId: status,
        firstName: status,
        lastName: "Test",
        fullName: status,
        isActive: true,
        createdAt: first,
      });
      await record(main, studentId, status);
    }
    await record(other, f.admin, "absent");
    for (const id of excluded) await record(id, f.admin, "absent");
  });
  const summary = () => f.as("admin").query(read, f.args);
  expect((await summary()).weeks[0].attendance).toBeNull(); // Legacy watermark.
  await f.t.mutation(refresh, f.args);
  const week = (await summary()).weeks[0];
  expect(week.counts?.scheduled).toBe(6); // The slot before term start is excluded from sessions too.
  expect(week.attendance).toEqual({
    present: 1,
    partial: 1,
    absent: 2,
    excused: 1,
  });
  const campus = { ...f.args, campusId: f.campusId, classId: f.classId };
  expect(
    (await f.as("principal").query(read, campus)).weeks[0].attendance,
  ).toEqual({ present: 1, partial: 1, absent: 1, excused: 1 });
  expect(
    (await f.as("principal").query(read, { ...f.args, campusId: f.campusId }))
      .weeks[0].attendance,
  ).toEqual({ present: 1, partial: 1, absent: 1, excused: 1 });
  const reviewPage = await f.as("admin").query(review, {
    ...f.args,
    weekEnd: addCivilDays(weekStart, 7),
    cursor: null,
  });
  expect(reviewPage.rows.map(({ scheduleId }) => scheduleId)).toContain(
    excluded[0],
  );
  expect(reviewPage.rows.map(({ scheduleId }) => scheduleId)).not.toContain(
    excluded[5],
  );
  await expect(f.as("teacher").query(read, campus)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await f.t.run(({ db }) =>
    db.patch("classSchedule", main, {
      status: "active",
      sessionClosureStatus: "pending",
    }),
  );
  // The historical snapshot remains unchanged until the explicit quiet-window refresh.
  expect((await summary()).weeks[0].attendance).toEqual(week.attendance);
  await f.t.mutation(refresh, f.args);
  const result = await f.as("principal").query(read, campus);
  expect(result.weeks[0].attendance).toEqual({
    present: 0,
    partial: 0,
    absent: 0,
    excused: 0,
  });
  expect(result.weeks[1].attendance).toBeNull();
});

test("authorizes the requested period, campus and course and respects revocation", async () => {
  const f = await fixture();
  const campus = { ...f.args, campusId: f.campusId };
  await expect(f.t.query(read, campus)).rejects.toThrow(
    "User not authenticated",
  );
  for (const role of ["teacher", "tutor", "student"]) {
    await expect(f.as(role).query(read, campus)).rejects.toThrow(
      "PERMISSION_DENIED",
    );
  }
  await expect(f.as("inactive").query(read, campus)).rejects.toThrow(
    "User not authenticated",
  );
  await expect(f.as("principal").query(read, f.args)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await expect(
    f.as("principal").query(read, { ...campus, campusId: f.otherCampusId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.as("principal").query(read, { ...campus, classId: f.otherClassId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.as("admin").query(read, { ...campus, classId: f.foreign.classId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f
      .as("admin")
      .query(read, { ...campus, academicPeriodId: f.foreign.academicPeriodId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f
      .as("admin")
      .query(read, { ...f.args, academicPeriodId: f.foreign.academicPeriodId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f
      .as("superadmin")
      .query(read, { ...f.args, academicPeriodId: f.foreign.academicPeriodId }),
  ).resolves.toMatchObject({ timeZone: "America/Tegucigalpa" });
  await expect(f.as("principal").query(read, campus)).resolves.toMatchObject({
    timeZone: "America/Tegucigalpa",
  });
  await f.t.run(({ db }) =>
    db.delete("roleAssignments", f.principalAssignment),
  );
  await expect(f.as("principal").query(read, campus)).rejects.toThrow(
    "PERMISSION_DENIED",
  );
  await expect(
    f.as("admin").query(read, { ...f.args, weekStart: "2026-10-13" }),
  ).rejects.toThrow("INVALID_DASHBOARD_WEEK");
  for (const weekEnd of [weekStart, "2026-10-20", "2026-11-16"]) {
    await expect(
      f.as("admin").query(read, { ...f.args, weekEnd }),
    ).rejects.toThrow("INVALID_DASHBOARD_WEEK");
  }
  await expect(
    f.t.mutation(refresh, { ...f.args, weekStart: "2099-11-09" }),
  ).rejects.toThrow("DASHBOARD_WEEK_NOT_FINISHED");
});

test("keeps four weeks under 250 KiB including authorization, and refuses partial totals above budget", async () => {
  const f = await fixture();
  const students = await f.t.run(async ({ db }) =>
    Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        db.insert("users", {
          clerkId: `attendance-fixture-${i}`,
          firstName: "Student",
          lastName: "Test",
          fullName: `Student ${i}`,
          isActive: true,
          createdAt: first,
        }),
      ),
    ),
  );
  const seed = (total: number) =>
    f.t.run(async ({ db }) => {
      for (let i = 0; i < total; i++) {
        const classId = await db.insert("classes", {
          academicPeriodId: f.academicPeriodId,
          campusId: f.campusId,
          schoolId: f.schoolId,
          curriculumId: f.curriculumId,
          isActive: true,
          name: "Fixture",
          createdAt: 0,
          createdBy: f.admin,
        });
        for (let week = 0; week < 4; week++) {
          const scheduledStart = first + week * weekMs;
          for (let occurrence = 0; occurrence < 4; occurrence++) {
            const scheduleId = await db.insert("classSchedule", {
              classId,
              schoolId: f.schoolId,
              scheduledStart: scheduledStart + occurrence * 86_400_000,
              scheduledEnd: scheduledStart + occurrence * 86_400_000 + 3600_000,
              roomName: `fixture-${classId}-${week}-${occurrence}`,
              sessionType: occurrence === 3 ? "abeka" : "live",
              status: occurrence === 0 ? "completed" : "scheduled",
              ...(occurrence === 0
                ? {
                    sessionClosureStatus: "completed" as const,
                    sessionStartedAt: scheduledStart,
                    completedAt: scheduledStart + 3600_000,
                  }
                : {}),
              createdAt: 0,
              createdBy: f.admin,
            });
            if (occurrence === 0) {
              for (const [index, studentId] of students.entries()) {
                const statuses = [
                  "present",
                  "partial",
                  "absent",
                  "excused",
                ] as const;
                await db.insert("studentAttendanceRecords", {
                  scheduleId,
                  studentId,
                  status: statuses[index % statuses.length],
                  confirmedAt: scheduledStart,
                  confirmedBy: f.admin,
                  lastUpdatedAt: scheduledStart,
                  lastUpdatedBy: f.admin,
                });
              }
            }
          }
        }
      }
    });
  const refreshFourWeeks = async () => {
    for (let week = 0; week < 4; week++) {
      const metrics = await f.t.run(async (ctx) => {
        await ctx.runMutation(refresh, {
          ...f.args,
          weekStart: addCivilDays(weekStart, week * 7),
        });
        return ctx.meta.getTransactionMetrics();
      });
      expect(metrics.bytesRead.used).toBeLessThan(
        DASHBOARD_REFRESH_READ_BUDGET,
      );
      expect(metrics.documentsWritten.used).toBe(155);
      if (week === 0)
        process.stdout.write(
          `Weekly dashboard initial refresh bytesRead: ${metrics.bytesRead.used}\n`,
        );
    }
  };
  await seed(154);
  await refreshFourWeeks();
  const { picker, page, pickerMetrics, reviewMetrics } = await f
    .as("admin")
    .run(async (ctx) => {
      const picker = await ctx.runQuery(courses, {
        academicPeriodId: f.academicPeriodId,
      });
      const pickerMetrics = await ctx.meta.getTransactionMetrics();
      const page = await ctx.runQuery(review, {
        ...f.args,
        weekEnd: addCivilDays(weekStart, 28),
        cursor: null,
      });
      return {
        picker,
        page,
        pickerMetrics,
        reviewMetrics: await ctx.meta.getTransactionMetrics(),
      };
    });
  expect(picker).toHaveLength(156);
  expect(page.rows).toHaveLength(20);
  expect(pickerMetrics.bytesRead.used).toBeLessThan(DASHBOARD_READ_BUDGET);
  expect(
    reviewMetrics.bytesRead.used - pickerMetrics.bytesRead.used,
  ).toBeLessThan(DASHBOARD_READ_BUDGET);
  expect(reviewMetrics.documentsWritten.used).toBe(0);
  process.stdout.write(
    `Dashboard course picker bytesRead: ${pickerMetrics.bytesRead.used}; first review page: ${reviewMetrics.bytesRead.used - pickerMetrics.bytesRead.used}\n`,
  );
  for (const [role, campusId] of [
    ["admin", undefined],
    ["principal", f.campusId],
  ] as const) {
    const { result, bytes } = await f.as(role).run(async (ctx) => {
      const result = await ctx.runQuery(read, { ...f.args, campusId });
      return {
        result,
        bytes: (await ctx.meta.getTransactionMetrics()).bytesRead.used,
      };
    });
    expect(result.weeks.map((row) => row.counts?.scheduled)).toEqual(
      Array(4).fill(462),
    );
    expect(result.weeks.map((row) => row.attendance)).toEqual(
      Array(4).fill({ present: 770, partial: 770, absent: 770, excused: 770 }),
    );
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(DASHBOARD_READ_BUDGET);
    process.stdout.write(
      `Weekly dashboard bytesRead (154 courses, ${role}): ${bytes}\n`,
    );
  }
  const replay = await f.t.run(async (ctx) => {
    await ctx.runMutation(refresh, f.args);
    return ctx.meta.getTransactionMetrics();
  });
  expect(replay.documentsWritten.used).toBe(1); // Only the refresh watermark.
  expect(replay.bytesRead.used).toBeLessThan(DASHBOARD_REFRESH_READ_BUDGET);
  process.stdout.write(
    `Weekly dashboard repeat refresh bytesRead: ${replay.bytesRead.used}\n`,
  );
  await f.t.run(async ({ db }) => {
    for (let i = 0; i < 450; i++) {
      const classId = await db.insert("classes", {
        academicPeriodId: f.academicPeriodId,
        campusId: f.campusId,
        schoolId: f.schoolId,
        curriculumId: f.curriculumId,
        isActive: true,
        name: "Large scope",
        createdAt: 0,
        createdBy: f.admin,
      });
      await db.insert("courseSessionWeeks", {
        academicPeriodId: f.academicPeriodId,
        campusId: f.campusId,
        classId,
        weekStart: addCivilDays(weekStart, 7),
        scheduled: 1,
        noStart: 1,
        completed: 0,
        cancelled: 0,
        other: 0,
      });
    }
  });
  await expect(
    f.as("principal").query(read, { ...f.args, campusId: f.campusId }),
  ).rejects.toThrow("DASHBOARD_READ_BUDGET_EXCEEDED");
  const { result: shortWindow, bytes: shortBytes } = await f
    .as("principal")
    .run(async (ctx) => {
      const result = await ctx.runQuery(read, {
        ...f.args,
        campusId: f.campusId,
        weekEnd: addCivilDays(weekStart, 7),
      });
      return {
        result,
        bytes: (await ctx.meta.getTransactionMetrics()).bytesRead.used,
      };
    });
  expect(shortWindow.weeks).toHaveLength(1);
  expect(shortWindow.weeks[0].attendance?.absent).toBe(770);
  expect(shortBytes).toBeLessThan(DASHBOARD_READ_BUDGET / 3);
  process.stdout.write(
    `Weekly dashboard bytesRead (one week): ${shortBytes}\n`,
  );
  const onlyCourse = await f
    .as("admin")
    .query(read, { ...f.args, classId: f.classId });
  expect(onlyCourse.weeks[0].counts?.scheduled).toBe(0);
}, 15_000);

test("waits until outside the institution window and defers while a class or event is live", async () => {
  const f = await fixture();
  const past = await f.insertSchedule(f.classId);
  const summary = () => f.as("admin").query(read, f.args);

  vi.setSystemTime(new Date("2026-11-12T12:00:00Z")); // Early join is available.
  await expect(f.t.mutation(refresh, f.args)).rejects.toThrow(
    "DASHBOARD_REFRESH_DURING_SCHOOL_HOURS",
  );
  expect((await summary()).weeks[0].counts).toBeNull();
  vi.setSystemTime(quietTime);
  await f.t.mutation(refresh, f.args);
  const before = await summary();
  expect(before.weeks[0].counts?.noStart).toBe(1);

  const activeClass = await f.insertSchedule(f.foreign.classId, {
    status: "active",
    isLive: true,
  });
  await f.t.run((ctx) =>
    weekTriggers.wrapDB(ctx).db.patch("classSchedule", past, { status: "cancelled" }),
  );
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before);
  await expect(f.t.mutation(refresh, f.args)).rejects.toThrow(
    "DASHBOARD_REFRESH_LIVE_ACTIVITY",
  );
  const activeEvent = await f.t.run(async ({ db }) => {
    await db.patch("classSchedule", activeClass, {
      status: "completed",
      isLive: false,
    });
    const eventId = await db.insert("events", {
      schoolId: f.foreign.schoolId,
      title: "Live fixture",
      responsibleId: f.admin,
      teacherIds: [],
      timeZone: "America/Tegucigalpa",
      createdAt: 0,
      createdBy: f.admin,
    });
    return db.insert("eventOccurrences", {
      eventId,
      schoolId: f.foreign.schoolId,
      scheduledStart: +quietTime,
      scheduledEnd: +quietTime + 3600_000,
      status: "active",
      isLive: true,
      roomName: "live-event-fixture",
      createdAt: 0,
      createdBy: f.admin,
    });
  });
  await expect(f.t.mutation(refresh, f.args)).rejects.toThrow(
    "DASHBOARD_REFRESH_LIVE_ACTIVITY",
  );
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before);
  const closingRoom = await f.t.run(async ({ db }) => {
    await db.patch("eventOccurrences", activeEvent, {
      status: "completed",
      isLive: false,
    });
    await db.patch("schools", f.schoolId, { scheduleEndMinutes: 23 * 60 + 30 });
    return db.insert("liveRoomActivations", {
      eventOccurrenceId: activeEvent,
      activationId: "closing-event",
      roomName: "live-event-fixture",
      liveRoomName: "live-event-fixture",
      status: "closing",
      cleanupAttempts: 0,
      nextCleanupAt: Date.now() + 60_000,
    });
  });
  await expect(f.t.mutation(refresh, f.args)).rejects.toThrow(
    "DASHBOARD_REFRESH_LIVE_ACTIVITY",
  );
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before);
  await f.t.run(async ({ db }) => {
    await db.patch("liveRoomActivations", closingRoom, { status: "closed" });
    await db.patch("classSchedule", activeClass, { liveEndClaimId: "legacy-claim" });
  });
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before);
  await f.t.run(({ db }) =>
    db.patch("classSchedule", activeClass, { liveEndClaimId: undefined }),
  );
  vi.setSystemTime(new Date("2026-11-13T06:15:00Z")); // Previous day's overrun window.
  await expect(f.t.mutation(refresh, f.args)).rejects.toThrow(
    "DASHBOARD_REFRESH_DURING_SCHOOL_HOURS",
  );
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before);
  vi.setSystemTime(new Date("2026-11-13T06:30:00Z"));
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before); // Retry delay after school hours.
  vi.setSystemTime(new Date("2026-11-13T07:15:00Z"));
  await f.t.mutation(refreshPending, {});
  const after = (await summary()).weeks[0];
  expect(after.counts).toMatchObject({
    scheduled: 1,
    cancelled: 1,
    noStart: 0,
  });
  expect(after.refreshedAt).toBeGreaterThan(before.weeks[0].refreshedAt!);
});

test("queues only missing weeks on initialization and waits for institutional week rollover", async () => {
  const f = await fixture();
  await f.t.run(({ db }) =>
    db.patch("academicPeriods", f.academicPeriodId, {
      startDate: weekStart,
      endDate: "2026-10-25",
    }),
  );
  const readyWeek = await f.insertSchedule(f.classId);
  await f.insertSchedule(f.classId, { scheduledStart: first + weekMs });
  vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
  await f.t.mutation(refresh, f.args);
  const pending = () => f.t.run(({ db }) => db.query("courseSessionWeekPending").collect());
  for (let i = 0; i < 2; i++) {
    await f.t.mutation(initializeHistory, { academicPeriodId: f.academicPeriodId });
  }
  expect(await pending()).toMatchObject([{
    weekStart: "2026-10-19",
    availableAt: Date.parse("2026-10-26T06:00:00Z"),
  }]);
  await f.t.mutation(refreshPending, {});
  expect(await pending()).toHaveLength(1);
  await f.t.run((ctx) => weekTriggers.wrapDB(ctx).db.patch("classSchedule", readyWeek, {
    scheduledStart: first + 86_400_000,
    scheduledEnd: first + 86_400_000 + 7200_000,
  }));
  expect(await pending()).toHaveLength(1); // Moving within the same week does not alter counts.
  vi.setSystemTime(new Date("2026-10-26T06:00:00Z"));
  await f.t.mutation(refreshPending, {});
  expect(await pending()).toEqual([]);
  const { weeks } = await f.as("admin").query(read, f.args);
  expect(weeks.slice(0, 2).map((week) => [week.counts?.scheduled, week.refreshedAt]))
    .toEqual([[1, Date.parse("2026-10-22T09:00:00Z")], [1, Date.now()]]);
  vi.setSystemTime(new Date("2026-10-26T09:00:00Z"));
  await f.t.mutation(refreshPending, {});
  expect((await f.as("admin").query(read, f.args)).weeks).toEqual(weeks);
  await expect(
    f.t.mutation(refresh, { ...f.args, weekStart: "2026-10-05" }),
  ).rejects.toThrow("DASHBOARD_WEEK_OUTSIDE_PERIOD");
});

test("late attendance changes queue one week and do not refresh an untouched week", async () => {
  const f = await fixture();
  const scheduleId = await f.insertSchedule(f.classId, {
    status: "completed",
    sessionStartedAt: first,
    completedAt: first + 3600_000,
    sessionClosureStatus: "completed",
  });
  const other = { ...f.args, weekStart: "2026-10-19" };
  await f.t.mutation(refresh, f.args);
  await f.t.mutation(refresh, other);
  const previous = await f.as("admin").query(read, f.args);
  const student = await f.t.run(({ db }) => db.query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", "student")).unique());
  await f.t.run(async ({ db }) => {
    await db.patch("classes", f.classId, { enrollmentsMigratedAt: Date.now() });
    await db.insert("classEnrollments", {
      classId: f.classId,
      studentId: student!._id,
      enrolledAt: Date.now(),
      enrolledBy: f.admin,
    });
    await db.insert("studentAttendanceRecords", {
      scheduleId,
      studentId: student!._id,
      status: "present",
      confirmedAt: Date.now(),
      confirmedBy: f.admin,
      lastUpdatedAt: Date.now(),
      lastUpdatedBy: f.admin,
    });
  });
  for (const status of ["absent", "excused"] as const) {
    await f.as("admin").mutation(api.schedule.updateAttendance, {
      scheduleId,
      studentId: student!._id,
      status,
      excuseReason: status === "excused" ? "Confirmed late" : undefined,
    });
  }
  const queue = await f.t.run(({ db }) => db.query("courseSessionWeekPending").collect());
  expect(queue).toMatchObject([{ weekStart }]);
  vi.setSystemTime(new Date(+quietTime + 600_000));
  await f.t.mutation(refreshPending, {});
  await f.t.mutation(refreshPending, {});
  const result = await f.as("admin").query(read, f.args);
  expect(result.weeks[0].attendance).toEqual({ present: 0, absent: 0, partial: 0, excused: 1 });
  expect(result.weeks[1]).toEqual(previous.weeks[1]);
});

test("a new period queues even its empty weeks and a moved session invalidates both weeks", async () => {
  const f = await fixture();
  const academicPeriodId = await f.as("admin").mutation(api.academicSettings.createPeriod, {
    schoolId: f.schoolId,
    name: "New period",
    startDate: "2027-06-01",
    endDate: "2027-06-13",
  });
  const schedule = await f.insertSchedule(f.classId);
  const nextWeek = { ...f.args, weekStart: "2026-10-19" };
  await f.t.mutation(refresh, f.args);
  await f.t.mutation(refresh, nextWeek);
  await f.t.run((ctx) =>
    weekTriggers.wrapDB(ctx).db.patch("classSchedule", schedule, {
      scheduledStart: first + weekMs,
      scheduledEnd: first + weekMs + 3600_000,
    }),
  );
  const queue = await f.t.run(({ db }) => db.query("courseSessionWeekPending").collect());
  expect(queue.filter((row) => row.academicPeriodId === academicPeriodId).map((row) => row.weekStart))
    .toEqual(["2027-05-31", "2027-06-07"]);
  expect(queue.filter((row) => row.academicPeriodId === f.academicPeriodId).map((row) => row.weekStart))
    .toEqual([weekStart, nextWeek.weekStart]);
  await f.t.mutation(refreshPending, {});
  await f.t.mutation(refreshPending, {});
  const { weeks } = await f.as("admin").query(read, f.args);
  expect(weeks.slice(0, 2).map((week) => week.counts?.scheduled)).toEqual([0, 1]);
});

test("editing a period only invalidates weeks whose date coverage changes", async () => {
  const f = await fixture();
  const school = f.as("admin");
  const dates = { name: "Earlier period", startDate: "2026-07-06", endDate: "2026-07-26" };
  const id = await school.mutation(api.academicSettings.createPeriod, {
    schoolId: f.schoolId,
    ...dates,
  });
  for (let i = 0; i < 3; i++) await f.t.mutation(refreshPending, {});
  await school.mutation(api.academicSettings.updatePeriod, {
    ...dates,
    id,
    startDate: "2026-07-08",
  });
  const pending = await f.t.run(({ db }) => db.query("courseSessionWeekPending").collect());
  expect(pending).toMatchObject([{ academicPeriodId: id, weekStart: "2026-07-06" }]);
});

test("a refresh exceeding its byte budget rolls back counts and the refresh date", async () => {
  const f = await fixture();
  const original = await f.insertSchedule(f.classId);
  await f.t.mutation(refresh, f.args);
  const summary = () => f.as("admin").query(read, f.args);
  const before = await summary();
  vi.setSystemTime(new Date("2026-11-13T09:00:00Z"));
  await f.t.run((ctx) =>
    weekTriggers.wrapDB(ctx).db.patch("classSchedule", original, { status: "cancelled" }),
  );
  const heavy: Id<"classSchedule">[] = [];
  for (let i = 0; i < 12; i++) {
    heavy.push(
      await f.insertSchedule(f.otherClassId, {
        description: "x".repeat(400_000),
      }),
    );
  }
  await expect(f.t.mutation(refresh, f.args)).rejects.toThrow(
    `limit: ${DASHBOARD_REFRESH_READ_BUDGET} bytes`,
  );
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await f.t.mutation(refreshPending, {});
    expect(errorLog).toHaveBeenCalledOnce();
  } finally {
    errorLog.mockRestore();
  }
  expect(await summary()).toEqual(before);
  await f.t.run(async ({ db }) => {
    for (const id of heavy) await db.delete("classSchedule", id);
  });
  await f.t.mutation(refreshPending, {});
  expect(await summary()).toEqual(before);
  vi.setSystemTime(new Date("2026-11-14T09:00:00Z"));
  await f.t.mutation(refreshPending, {});
  expect((await summary()).weeks[0].counts?.cancelled).toBe(1);
});
