import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  setupClassSessionVideoTest,
  NOW,
  HOUR,
} from "./testHelpers/classSessionVideo.fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const s = await setupClassSessionVideoTest();
  const campusId = await s.t.run(async (ctx) => {
    const campusId = await ctx.db.insert("campuses", {
      schoolId: s.schoolId,
      name: "Reports",
      slug: "reports",
      isActive: true,
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    await ctx.db.patch(s.classId, { campusId });
    const periodId = await ctx.db.insert("academicPeriods", {
      schoolId: s.schoolId,
      name: "Reports period",
      startDate: NOW,
      endDate: NOW + 100 * HOUR,
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    await ctx.db.patch(s.classId, { academicPeriodId: periodId });
    await ctx.db.insert("classGradeAssignments", {
      classId: s.classId,
      campusId,
      academicPeriodId: periodId,
      gradeCode: "05",
      teacherId: s.users.multigrade,
    });
    for (const role of ["student", "teacher", "multigrade"] as const)
      await ctx.db.insert("roleAssignments", {
        userId: s.users[role],
        orgId: campusId,
        orgType: "campus",
        role: role === "student" ? "student" : "teacher",
        assignedAt: NOW,
      });
    return campusId;
  });
  async function video(start = NOW, released = true, verified = true) {
    return s.t.run(async (ctx) => {
      const scheduleId = await ctx.db.insert("classSchedule", {
        classId: s.classId,
        roomName: `report-${start}`,
        sessionType: "live",
        status: "scheduled",
        scheduledStart: start,
        scheduledEnd: start + HOUR,
        createdAt: NOW,
        createdBy: s.users.admin,
      });
      const id = await ctx.db.insert("classSessionVideos", {
        scheduleId,
        classId: s.classId,
        uploadedBy: s.users.teacher,
        bucket: "private",
        name: `video-${start}.mp4`,
        contentType: "video/mp4",
        size: 100,
        durationMs: 60_000,
        state: "ready",
        createdAt: NOW,
        ...(verified ? { verifiedDurationMs: 60_000 } : {}),
      });
      await ctx.db.patch(scheduleId, {
        prerecordedVideoId: id,
        prerecordedVideoReleased: released,
      });
      return { id, scheduleId };
    });
  }
  const args = {
    classId: s.classId,
    studentId: s.users.student,
    orgSlug: "reports",
    paginationOpts: { numItems: 10, cursor: null },
  };
  return { ...s, campusId, video, args };
}

test("reports preserve zero, partial and unknown progress without exposing storage or coverage", async () => {
  const s = await setup();
  const zero = await s.video(NOW);
  const partial = await s.video(NOW + 1);
  const unknown = await s.video(NOW + 2, true, false);
  await s.video(NOW + 3, false);
  await s.t.run(async (ctx) => {
    await ctx.db.insert("videoViewingProgress", {
      videoId: partial.id,
      studentId: s.users.student,
      durationMs: 60_000,
      coverage: new ArrayBuffer(8),
      watchedMs: 10_000,
      updatedAt: NOW + 20,
    });
    // Another learner's coverage must never become this learner's progress.
    await ctx.db.insert("videoViewingProgress", {
      videoId: zero.id,
      studentId: s.users.unassigned,
      durationMs: 60_000,
      coverage: new ArrayBuffer(8),
      watchedMs: 60_000,
      updatedAt: NOW + 20,
    });
  });
  const report = await s.teacher.query(
    api.videoViewingProgress.courseReport,
    s.args,
  );
  expect(report.page.map((row) => row.videoId)).toEqual([
    unknown.id,
    partial.id,
    zero.id,
  ]);
  expect(report.page[0]).toMatchObject({
    percentage: null,
    lastProgressAt: null,
  });
  expect(report.page[1].percentage).toBeCloseTo(100 / 6);
  expect(report.page[1].lastProgressAt).toBe(NOW + 20);
  expect(report.page[2]).toMatchObject({ percentage: 0, lastProgressAt: null });
  expect(Object.keys(report.page[1]).sort()).toEqual([
    "lastProgressAt",
    "name",
    "percentage",
    "scheduledStart",
    "videoId",
  ]);
  expect(
    (
      await s.student.query(api.videoViewingProgress.courseReport, {
        classId: s.classId,
        paginationOpts: s.args.paginationOpts,
      })
    ).page,
  ).toEqual(report.page);
  expect(
    await s.t.run((ctx) => ctx.db.query("studentAttendanceRecords").collect()),
  ).toEqual([]);
});

test("replaying covered video preserves the saved-progress date and does not rewrite progress", async () => {
  const s = await setup();
  const video = await s.video();
  const progress = await s.student.mutation(
    internal.videoViewingProgress.initialize,
    {
      videoId: video.id,
      durationMs: 60_000,
    },
  );
  const coverage = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 15])
    .buffer;
  await s.student.mutation(api.videoViewingProgress.record, {
    id: progress.id,
    coverage,
  });
  const saved = await s.t.run((ctx) => ctx.db.get(progress.id));
  vi.setSystemTime(NOW + 24 * HOUR);
  await s.student.mutation(api.videoViewingProgress.record, {
    id: progress.id,
    coverage,
  });
  expect(await s.t.run((ctx) => ctx.db.get(progress.id))).toEqual(saved);
  const report = await s.teacher.query(
    api.videoViewingProgress.courseReport,
    s.args,
  );
  expect(report.page).toEqual([
    expect.objectContaining({
      videoId: video.id,
      percentage: 100,
      lastProgressAt: NOW,
    }),
  ]);
});

test("dashboard report capabilities follow course permissions and revocation", async () => {
  const s = await setup();
  const otherCourse = await s.t.run(async (ctx) => {
    const course = (await ctx.db.get(s.classId))!;
    const id = await ctx.db.insert("classes", {
      schoolId: s.schoolId,
      campusId: s.campusId,
      curriculumId: course.curriculumId,
      name: "Other course",
      teacherId: s.users.unassigned,
      isActive: true,
      enrollmentsMigratedAt: NOW,
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    await ctx.db.insert("classEnrollments", {
      classId: id,
      studentId: s.users.student,
      enrolledAt: NOW,
      enrolledBy: s.users.admin,
    });
    return id;
  });
  const target = { studentId: s.users.student, orgSlug: "reports" };
  for (const client of [s.teacher, s.multigrade]) {
    const dashboard = await client.query(
      api.student.getStudentDashboardStats,
      target,
    );
    expect(
      dashboard?.classes.find((course) => course.classId === s.classId)
        ?.canViewPrerecordedProgress,
    ).toBe(true);
    expect(
      dashboard?.classes.find((course) => course.classId === otherCourse)
        ?.canViewPrerecordedProgress,
    ).toBe(false);
  }
  for (const [client, args] of [
    [s.admin, target],
    [s.student, {}],
  ] as const) {
    const dashboard = await client.query(
      api.student.getStudentDashboardStats,
      args,
    );
    expect(dashboard?.classes).toHaveLength(2);
    expect(
      dashboard?.classes.every((course) => course.canViewPrerecordedProgress),
    ).toBe(true);
  }
  await s.t.run((ctx) => ctx.db.patch(s.users.teacher, { isActive: false }));
  const inactive = await s.teacher.query(
    api.student.getStudentDashboardStats,
    target,
  );
  expect(inactive).toBeNull();
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.users.teacher, { isActive: true });
    await ctx.db.patch(s.classId, { teacherId: s.users.unassigned });
  });
  expect(
    await s.teacher.query(api.student.getStudentDashboardStats, target),
  ).toBeNull();
  await s.t.run((ctx) => ctx.db.patch(s.users.student, { isActive: false }));
  const inactiveStudent = await s.admin.query(
    api.student.getStudentDashboardStats,
    target,
  );
  expect(
    inactiveStudent?.classes.every(
      (course) => !course.canViewPrerecordedProgress,
    ),
  ).toBe(true);
});

test("rechecks profile and course access for staff, students, multigrade teachers and revoked access", async () => {
  const s = await setup();
  await s.video();
  for (const client of [s.teacher, s.multigrade, s.admin])
    expect(
      (await client.query(api.videoViewingProgress.courseReport, s.args)).page,
    ).toHaveLength(1);
  for (const client of [s.unassigned, s.outsideAdmin, s.tutor, s.t])
    expect(
      (await client.query(api.videoViewingProgress.courseReport, s.args)).page,
    ).toEqual([]);
  expect(
    (
      await s.student.query(api.videoViewingProgress.courseReport, {
        ...s.args,
        studentId: s.users.unassigned,
      })
    ).page,
  ).toEqual([]);
  await s.t.run(async (ctx) => {
    const principal = await ctx.db.insert("users", {
      clerkId: "principal",
      firstName: "Principal",
      lastName: "Test",
      fullName: "Principal Test",
      isActive: true,
      createdAt: NOW,
    });
    await ctx.db.insert("roleAssignments", {
      userId: principal,
      orgId: s.campusId,
      orgType: "campus",
      role: "principal",
      assignedAt: NOW,
    });
  });
  expect(
    (
      await s.t
        .withIdentity({ subject: "principal" })
        .query(api.videoViewingProgress.courseReport, s.args)
    ).page,
  ).toHaveLength(1);
  expect(
    (
      await s.t
        .withIdentity({ subject: "principal" })
        .query(api.student.getStudentDashboardStats, {
          studentId: s.users.student,
          orgSlug: "reports",
        })
    )?.classes[0].canViewPrerecordedProgress,
  ).toBe(true);
  const otherCourse = await s.t.run(async (ctx) => {
    const original = (await ctx.db.get(s.classId))!;
    const id = await ctx.db.insert("classes", {
      campusId: s.campusId,
      schoolId: s.schoolId,
      curriculumId: original.curriculumId,
      name: "Other",
      teacherId: s.users.unassigned,
      isActive: true,
      enrollmentsMigratedAt: NOW,
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    await ctx.db.insert("classEnrollments", {
      classId: id,
      studentId: s.users.student,
      enrolledAt: NOW,
      enrolledBy: s.users.admin,
    });
    return id;
  });
  expect(
    (
      await s.teacher.query(api.videoViewingProgress.courseReport, {
        ...s.args,
        classId: otherCourse,
      })
    ).page,
  ).toEqual([]);
  await s.t.run((ctx) => ctx.db.patch(s.users.teacher, { isActive: false }));
  expect(
    (await s.teacher.query(api.videoViewingProgress.courseReport, s.args)).page,
  ).toEqual([]);
  await s.t.run(async (ctx) => {
    const row = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.delete(row!._id);
  });
  expect(
    (await s.admin.query(api.videoViewingProgress.courseReport, s.args)).page,
  ).toEqual([]);
});

test("pages only published videos in session order; missing legacy flags and cancelled/replaced videos stay hidden", async () => {
  const s = await setup();
  const ids: Id<"classSessionVideos">[] = [];
  for (let i = 0; i < 27; i++) ids.push((await s.video(NOW + i)).id);
  const cancelled = await s.video(NOW + 100);
  const replaced = await s.video(NOW + 101);
  const legacy = await s.video(NOW + 102);
  await s.t.run(async (ctx) => {
    await ctx.db.patch(cancelled.scheduleId, { status: "cancelled" });
    await ctx.db.patch(replaced.id, { state: "retired" });
    await ctx.db.patch(legacy.scheduleId, {
      prerecordedVideoReleased: undefined,
    });
  });
  let cursor: string | null = null;
  const received: string[] = [];
  for (let i = 0; i < 10; i++) {
    const result: FunctionReturnType<
      typeof api.videoViewingProgress.courseReport
    > = await s.admin.query(api.videoViewingProgress.courseReport, {
      ...s.args,
      paginationOpts: { numItems: 10, cursor },
    });
    expect(result.page.length).toBeLessThanOrEqual(10);
    received.push(...result.page.map((row) => row.videoId));
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(received).toEqual(ids.reverse());
  for (const numItems of [0, 51, 1.5])
    await expect(
      s.admin.query(api.videoViewingProgress.courseReport, {
        ...s.args,
        paginationOpts: { numItems, cursor: null },
      }),
    ).rejects.toThrow("INVALID_PAGE_SIZE");
});
