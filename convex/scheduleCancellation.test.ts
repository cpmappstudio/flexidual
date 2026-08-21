import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { localDateTimeToUtc } from "../lib/time-zone";

const NOW = localDateTimeToUtc("2026-08-20T12:00", "UTC");

afterEach(() => {
  vi.useRealTimers();
});

async function setupCancellationTest() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      clerkId: "cancel-admin",
      email: "admin@example.com",
      firstName: "Ada",
      lastName: "Admin",
      fullName: "Ada Admin",
      isActive: true,
      createdAt: NOW,
    });
    const teacherId = await ctx.db.insert("users", {
      clerkId: "cancel-teacher",
      email: "teacher@example.com",
      firstName: "Taylor",
      lastName: "Teacher",
      fullName: "Taylor Teacher",
      isActive: true,
      createdAt: NOW,
    });
    const tutorId = await ctx.db.insert("users", {
      clerkId: "cancel-tutor",
      email: "tutor@example.com",
      firstName: "Terry",
      lastName: "Tutor",
      fullName: "Terry Tutor",
      isActive: true,
      createdAt: NOW,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "Cancellation School",
      slug: "cancellation-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main Campus",
      slug: "main-campus",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Science",
      isActive: true,
      schoolId,
      createdAt: NOW,
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "Fall 2026",
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      createdAt: NOW,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Science 5",
      curriculumId,
      teacherId,
      tutorId,
      schoolId,
      campusId,
      academicPeriodId,
      weeklySlots: [
        {
          dayOfWeek: 1,
          startMinutes: 9 * 60,
          durationMinutes: 60,
          sessionType: "live",
        },
      ],
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const parentId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-17T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-17T10:00", "UTC"),
      roomName: "series-parent",
      isRecurring: true,
      status: "completed",
      completedAt: localDateTimeToUtc("2026-08-17T10:00", "UTC"),
      createdAt: NOW,
      createdBy: adminId,
    });
    const earlyFutureId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-24T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-24T10:00", "UTC"),
      roomName: "series-early-future",
      isRecurring: true,
      recurrenceParentId: parentId,
      status: "scheduled",
      createdAt: NOW,
      createdBy: adminId,
    });
    const selectedId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-08-31T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-08-31T10:00", "UTC"),
      roomName: "series-selected",
      isRecurring: true,
      recurrenceParentId: parentId,
      status: "scheduled",
      createdAt: NOW,
      createdBy: adminId,
    });
    const laterId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-09-07T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-09-07T10:00", "UTC"),
      roomName: "series-later",
      isRecurring: true,
      recurrenceParentId: parentId,
      status: "scheduled",
      createdAt: NOW,
      createdBy: adminId,
    });
    const activeId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: localDateTimeToUtc("2026-09-14T09:00", "UTC"),
      scheduledEnd: localDateTimeToUtc("2026-09-14T10:00", "UTC"),
      roomName: "series-active",
      isRecurring: true,
      recurrenceParentId: parentId,
      isLive: true,
      status: "active",
      createdAt: NOW,
      createdBy: adminId,
    });

    return {
      adminId,
      teacherId,
      tutorId,
      classId,
      parentId,
      earlyFutureId,
      selectedId,
      laterId,
      activeId,
    };
  });
  return { t, data };
}

test("the assigned teacher cancels one future occurrence with audit data", async () => {
  const { t, data } = await setupCancellationTest();
  const result = await t
    .withIdentity({ subject: "cancel-teacher" })
    .mutation(api.schedule.cancelSchedule, {
      id: data.earlyFutureId,
      reason: "Teacher is unavailable.",
    });

  expect(result).toEqual({ cancelled: 1, type: "single" });
  const state = await t.run(async (ctx) => ({
    schedule: await ctx.db.get("classSchedule", data.earlyFutureId),
    course: await ctx.db.get("classes", data.classId),
    events: await ctx.db.query("classCancellationEvents").collect(),
  }));
  expect(state.schedule).toMatchObject({
    status: "cancelled",
    cancellationReason: "Teacher is unavailable.",
    cancelledAt: NOW,
    cancelledBy: data.teacherId,
    cancellationScope: "occurrence",
    cancellationEffectiveAt: localDateTimeToUtc("2026-08-24T09:00", "UTC"),
  });
  expect(state.course?.weeklySlots).toHaveLength(1);
  expect(state.events).toHaveLength(1);
  expect(state.events[0]).toMatchObject({
    classId: data.classId,
    scheduleId: data.earlyFutureId,
    affectedScheduleIds: [data.earlyFutureId],
    actorId: data.teacherId,
    scope: "occurrence",
    source: "calendar",
    reason: "Teacher is unavailable.",
    occurredAt: NOW,
  });
});

test("teachers and tutors cannot cancel a recurring series", async () => {
  const { t, data } = await setupCancellationTest();
  for (const subject of ["cancel-teacher", "cancel-tutor"]) {
    await expect(
      t.withIdentity({ subject }).mutation(api.schedule.cancelSchedule, {
        id: data.selectedId,
        cancelSeries: true,
        reason: "Recurring classes are no longer required.",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
});

test("an administrator cancels only scheduled occurrences from the selected date", async () => {
  const { t, data } = await setupCancellationTest();
  const asAdmin = t.withIdentity({ subject: "cancel-admin" });
  const result = await asAdmin.mutation(api.schedule.cancelSchedule, {
    id: data.selectedId,
    cancelSeries: true,
    reason: "The weekly session is discontinued.",
  });

  expect(result).toEqual({ cancelled: 2, type: "series" });
  const state = await t.run(async (ctx) => ({
    parent: await ctx.db.get("classSchedule", data.parentId),
    earlyFuture: await ctx.db.get("classSchedule", data.earlyFutureId),
    selected: await ctx.db.get("classSchedule", data.selectedId),
    later: await ctx.db.get("classSchedule", data.laterId),
    active: await ctx.db.get("classSchedule", data.activeId),
    events: await ctx.db.query("classCancellationEvents").collect(),
  }));
  expect(state.parent?.status).toBe("completed");
  expect(state.earlyFuture?.status).toBe("scheduled");
  expect(state.active?.status).toBe("active");
  for (const schedule of [state.selected, state.later]) {
    expect(schedule).toMatchObject({
      status: "cancelled",
      cancellationReason: "The weekly session is discontinued.",
      cancelledBy: data.adminId,
      cancellationScope: "series",
      cancellationEffectiveAt: localDateTimeToUtc("2026-08-31T09:00", "UTC"),
    });
  }
  expect(state.events).toHaveLength(1);
  expect(state.events[0]).toMatchObject({
    classId: data.classId,
    scheduleId: data.selectedId,
    affectedScheduleIds: [data.selectedId, data.laterId],
    actorId: data.adminId,
    scope: "series",
    source: "calendar",
    reason: "The weekly session is discontinued.",
    effectiveAt: localDateTimeToUtc("2026-08-31T09:00", "UTC"),
    occurredAt: NOW,
  });

  await expect(
    asAdmin.mutation(api.schedule.cancelSchedule, {
      id: data.selectedId,
      cancelSeries: true,
      reason: "The weekly session is discontinued.",
    }),
  ).resolves.toEqual({ cancelled: 0, type: "series" });
  expect(
    await t.run(
      async (ctx) =>
        (await ctx.db.query("classCancellationEvents").collect()).length,
    ),
  ).toBe(1);
});

test("cancellation requires a reason and a future scheduled occurrence", async () => {
  const { t, data } = await setupCancellationTest();
  const asAdmin = t.withIdentity({ subject: "cancel-admin" });
  await expect(
    asAdmin.mutation(api.schedule.cancelSchedule, {
      id: data.earlyFutureId,
      reason: "   ",
    }),
  ).rejects.toThrow("CANCELLATION_REASON_REQUIRED");
  await expect(
    asAdmin.mutation(api.schedule.cancelSchedule, {
      id: data.parentId,
      reason: "This class has already ended.",
    }),
  ).rejects.toThrow("SCHEDULE_CANNOT_BE_CANCELLED");
  await expect(
    asAdmin.mutation(api.schedule.cancelSchedule, {
      id: data.activeId,
      reason: "This class is already active.",
    }),
  ).rejects.toThrow("SCHEDULE_CANNOT_BE_CANCELLED");
});
