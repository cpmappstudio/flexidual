import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { localDateTimeToUtc, utcToLocalDateTime } from "../lib/time-zone";

afterEach(() => {
  vi.useRealTimers();
});

test("editing a weekly schedule preserves history and replaces only future occurrences", async () => {
  vi.useFakeTimers();
  const now = localDateTimeToUtc("2026-08-14T12:00", "UTC");
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);

  const data = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      clerkId: "schedule-admin",
      email: "admin@example.com",
      firstName: "Ada",
      lastName: "Admin",
      fullName: "Ada Admin",
      isActive: true,
      createdAt: now,
    });
    const teacherId = await ctx.db.insert("users", {
      clerkId: "schedule-teacher",
      email: "teacher@example.com",
      firstName: "Taylor",
      lastName: "Teacher",
      fullName: "Taylor Teacher",
      isActive: true,
      createdAt: now,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "Schedule School",
      slug: "schedule-school",
      timeZone: "UTC",
      scheduleStartMinutes: 8 * 60,
      scheduleEndMinutes: 17 * 60,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main Campus",
      slug: "schedule-campus",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      schoolId,
      assignedAt: now,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: teacherId,
      orgId: campusId,
      orgType: "campus",
      role: "teacher",
      schoolId,
      assignedAt: now,
      assignedBy: adminId,
    });
    await ctx.db.insert("institutionGrades", {
      schoolId,
      code: "05",
      name: "5th Grade",
      order: 5,
      createdAt: now,
      createdBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Science",
      isActive: true,
      gradeCodes: ["05"],
      schoolId,
      createdAt: now,
      createdBy: adminId,
    });
    const lessonId = await ctx.db.insert("lessons", {
      curriculumId,
      title: "Cells",
      order: 1,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "Fall 2026",
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      createdAt: now,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Science 5",
      description: "Original description",
      curriculumId,
      teacherId,
      schoolId,
      campusId,
      academicPeriodId,
      academicYear: "Fall 2026",
      gradeCode: "05",
      timeZone: "UTC",
      classType: "standard",
      liveAccess: { mode: "private", allowedGradeCodes: [] },
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const pastScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: [lessonId],
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-10T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-10T10:00", "UTC"),
      roomName: "past-room",
      isRecurring: true,
      recurrenceRule: JSON.stringify({
        type: "weekly",
        daysOfWeek: [1],
      }),
      status: "completed",
      completedAt: localDateTimeToUtc("2026-08-10T10:00", "UTC"),
      createdAt: now,
      createdBy: adminId,
    });
    const firstFutureId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: [lessonId],
      title: "Cells review",
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-17T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-17T10:00", "UTC"),
      roomName: "future-room-1",
      isRecurring: true,
      recurrenceParentId: pastScheduleId,
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    const activeScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: [],
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-14T11:30", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-14T12:30", "UTC"),
      roomName: "active-room",
      isLive: true,
      status: "active",
      createdAt: now,
      createdBy: adminId,
    });
    const manualFutureScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: [],
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-21T15:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-21T16:00", "UTC"),
      roomName: "manual-future-room",
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    const secondFutureId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: [],
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-24T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-24T10:00", "UTC"),
      roomName: "future-room-2",
      isRecurring: true,
      recurrenceParentId: pastScheduleId,
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    const attendanceId = await ctx.db.insert("class_sessions", {
      scheduleId: pastScheduleId,
      studentId: teacherId,
      joinedAt: localDateTimeToUtc("2026-08-10T09:00", "UTC"),
      leftAt: localDateTimeToUtc("2026-08-10T10:00", "UTC"),
      durationSeconds: 3600,
      roomName: "past-room",
      sessionDate: "2026-08-10",
    });
    const recordingId = await ctx.db.insert("recordings", {
      scheduleId: pastScheduleId,
      roomName: "past-room",
      egressId: "past-egress",
      status: "complete",
      url: "https://example.com/past.mp4",
      startedAt: localDateTimeToUtc("2026-08-10T09:00", "UTC"),
      completedAt: localDateTimeToUtc("2026-08-10T10:00", "UTC"),
    });

    return {
      classId,
      lessonId,
      pastScheduleId,
      firstFutureId,
      secondFutureId,
      activeScheduleId,
      manualFutureScheduleId,
      attendanceId,
      recordingId,
    };
  });

  const asAdmin = t.withIdentity({ subject: "schedule-admin" });
  const asTeacher = t.withIdentity({ subject: "schedule-teacher" });
  await expect(
    asTeacher.mutation(api.classes.update, {
      classId: data.classId,
      name: "Unauthorized edit",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");

  const legacyCourse = await asAdmin.query(api.classes.get, {
    id: data.classId,
  });
  expect(legacyCourse).toMatchObject({
    name: "Science 5",
    curriculumTitle: "Science",
    teacherName: "Taylor Teacher",
    gradeCode: "05",
    gradeName: "5th Grade",
    academicPeriodId: expect.any(String),
    academicYear: "Fall 2026",
    liveAccess: { mode: "private", allowedGradeCodes: [] },
  });
  expect(legacyCourse?.weeklySlots).toEqual([
    {
      dayOfWeek: 1,
      startMinutes: 9 * 60,
      durationMinutes: 60,
      sessionType: "live",
    },
  ]);

  const changedWeeklySlots = [
    {
      dayOfWeek: 3,
      startMinutes: 10 * 60,
      durationMinutes: 90,
      sessionType: "live" as const,
    },
  ];
  await expect(
    asAdmin.mutation(api.classes.update, {
      classId: data.classId,
      weeklySlots: changedWeeklySlots,
    }),
  ).rejects.toThrow("CANCELLATION_REASON_REQUIRED");

  await asAdmin.mutation(api.classes.update, {
    classId: data.classId,
    weeklySlots: changedWeeklySlots,
    scheduleCancellationReason: "The Monday block is no longer offered.",
  });

  const result = await t.run(async (ctx) => ({
    course: await ctx.db.get("classes", data.classId),
    schedules: await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", data.classId))
      .collect(),
    oldFirstFuture: await ctx.db.get("classSchedule", data.firstFutureId),
    oldSecondFuture: await ctx.db.get("classSchedule", data.secondFutureId),
    activeSchedule: await ctx.db.get("classSchedule", data.activeScheduleId),
    manualFutureSchedule: await ctx.db.get(
      "classSchedule",
      data.manualFutureScheduleId,
    ),
    attendance: await ctx.db.get("class_sessions", data.attendanceId),
    recording: await ctx.db.get("recordings", data.recordingId),
    cancellationEvents: await ctx.db.query("classCancellationEvents").collect(),
  }));

  expect(result.course?.weeklySlots).toEqual([
    {
      dayOfWeek: 3,
      startMinutes: 10 * 60,
      durationMinutes: 90,
      sessionType: "live",
    },
  ]);
  for (const cancelled of [result.oldFirstFuture, result.oldSecondFuture]) {
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancellationReason: "The Monday block is no longer offered.",
      cancellationScope: "series",
      cancelledAt: now,
      cancellationEffectiveAt: localDateTimeToUtc("2026-08-17T09:00", "UTC"),
    });
  }
  expect(result.activeSchedule).toMatchObject({
    roomName: "active-room",
    status: "active",
    isLive: true,
  });
  expect(result.manualFutureSchedule).toMatchObject({
    roomName: "manual-future-room",
    status: "scheduled",
  });
  expect(result.attendance).not.toBeNull();
  expect(result.recording).not.toBeNull();
  expect(result.cancellationEvents).toHaveLength(1);
  expect(result.cancellationEvents[0]).toMatchObject({
    classId: data.classId,
    affectedScheduleIds: [data.firstFutureId, data.secondFutureId],
    scope: "series",
    source: "course_schedule",
    reason: "The Monday block is no longer offered.",
    effectiveAt: localDateTimeToUtc("2026-08-17T09:00", "UTC"),
    occurredAt: now,
  });

  const pastSchedule = result.schedules.find(
    (schedule) => schedule._id === data.pastScheduleId,
  );
  expect(pastSchedule).toMatchObject({
    roomName: "past-room",
    status: "completed",
  });

  const futureSchedules = result.schedules
    .filter(
      (schedule) =>
        schedule.scheduledStart >= now &&
        schedule.isRecurring === true &&
        schedule.status === "scheduled",
    )
    .sort((a, b) => a.scheduledStart - b.scheduledStart);
  expect(futureSchedules.length).toBeGreaterThan(0);
  expect(
    futureSchedules.every((schedule) => {
      const localStart = utcToLocalDateTime(schedule.scheduledStart, "UTC");
      return (
        new Date(`${localStart.slice(0, 10)}T00:00:00Z`).getUTCDay() === 3 &&
        localStart.slice(11) === "10:00" &&
        schedule.scheduledEnd - schedule.scheduledStart === 90 * 60_000
      );
    }),
  ).toBe(true);
  expect(futureSchedules[0]).toMatchObject({
    lessonIds: [data.lessonId],
    title: "Cells review",
  });
  expect(futureSchedules[0].recurrenceParentId).toBeUndefined();
  expect(
    futureSchedules
      .slice(1)
      .every(
        (schedule) => schedule.recurrenceParentId === futureSchedules[0]._id,
      ),
  ).toBe(true);

  const futureScheduleIds = futureSchedules.map((schedule) => schedule._id);
  await asAdmin.mutation(api.classes.update, {
    classId: data.classId,
    name: "Science 5 updated",
    description: null,
    weeklySlots: [
      {
        dayOfWeek: 3,
        startMinutes: 10 * 60,
        durationMinutes: 90,
        sessionType: "live",
      },
    ],
  });

  const textOnlyResult = await t.run(async (ctx) => ({
    course: await ctx.db.get("classes", data.classId),
    futureScheduleIds: (
      await ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", data.classId))
        .collect()
    )
      .filter(
        (schedule) =>
          schedule.scheduledStart >= now &&
          schedule.isRecurring === true &&
          schedule.status === "scheduled",
      )
      .sort((a, b) => a.scheduledStart - b.scheduledStart)
      .map((schedule) => schedule._id),
  }));
  expect(textOnlyResult.course).toMatchObject({
    name: "Science 5 updated",
  });
  expect(textOnlyResult.course?.description).toBeUndefined();
  expect(textOnlyResult.futureScheduleIds).toEqual(futureScheduleIds);

  const cancelledOccurrenceId = futureScheduleIds[1];
  await asAdmin.mutation(api.schedule.cancelSchedule, {
    id: cancelledOccurrenceId,
    reason: "One class will not take place.",
  });
  const cancelledStart = await t.run(async (ctx) => {
    const schedule = await ctx.db.get("classSchedule", cancelledOccurrenceId);
    return schedule!.scheduledStart;
  });

  await asAdmin.mutation(api.classes.update, {
    classId: data.classId,
    weeklySlots: [
      ...changedWeeklySlots,
      {
        dayOfWeek: 4,
        startMinutes: 14 * 60,
        durationMinutes: 60,
        sessionType: "live",
      },
    ],
  });

  const sameTimeSchedules = await t.run(async (ctx) =>
    (
      await ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", data.classId))
        .collect()
    ).filter((schedule) => schedule.scheduledStart === cancelledStart),
  );
  expect(sameTimeSchedules).toHaveLength(1);
  expect(sameTimeSchedules[0]).toMatchObject({
    _id: cancelledOccurrenceId,
    status: "cancelled",
    cancellationReason: "One class will not take place.",
    cancellationScope: "occurrence",
  });
});

test("removing a weekly block before the academic period starts is structural", async () => {
  vi.useFakeTimers();
  const now = localDateTimeToUtc("2026-08-20T12:00", "UTC");
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);

  const data = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      clerkId: "future-period-admin",
      email: "future-admin@example.com",
      firstName: "Future",
      lastName: "Admin",
      fullName: "Future Period Admin",
      isActive: true,
      createdAt: now,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "Future School",
      slug: "future-school",
      timeZone: "UTC",
      scheduleStartMinutes: 8 * 60,
      scheduleEndMinutes: 17 * 60,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Future Campus",
      slug: "future-campus",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      schoolId,
      assignedAt: now,
      assignedBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Future Science",
      isActive: true,
      gradeCodes: [],
      schoolId,
      createdAt: now,
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "Future Term",
      startDate: "2026-09-01",
      endDate: "2026-10-31",
      createdAt: now,
      createdBy: adminId,
    });
    const weeklySlot = {
      dayOfWeek: 1,
      startMinutes: 9 * 60,
      durationMinutes: 60,
      sessionType: "live" as const,
    };
    const classId = await ctx.db.insert("classes", {
      name: "Future Science",
      curriculumId,
      schoolId,
      campusId,
      academicPeriodId,
      timeZone: "UTC",
      weeklySlots: [weeklySlot],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: [],
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-09-07T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-09-07T10:00", "UTC"),
      roomName: "future-period-room",
      isRecurring: true,
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    return { classId, scheduleId };
  });

  await t
    .withIdentity({ subject: "future-period-admin" })
    .mutation(api.classes.update, {
      classId: data.classId,
      weeklySlots: [],
    });

  const state = await t.run(async (ctx) => ({
    course: await ctx.db.get("classes", data.classId),
    schedule: await ctx.db.get("classSchedule", data.scheduleId),
    events: await ctx.db.query("classCancellationEvents").collect(),
  }));
  expect(state.course?.weeklySlots).toEqual([]);
  expect(state.schedule).toBeNull();
  expect(state.events).toEqual([]);
});
