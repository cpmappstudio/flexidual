import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.UTC(2026, 7, 29, 12);
const FUTURE_SCHEDULE_COUNT = 1_400;

test("getMySchedule does not hydrate future schedule details row by row", async () => {
  const t = convexTest(schema, modules);
  const classId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "schedule-performance-admin",
      firstName: "Schedule",
      lastName: "Admin",
      fullName: "Schedule Admin",
      isActive: true,
      createdAt: NOW,
    });
    await ctx.db.insert("roleAssignments", {
      userId,
      orgType: "system",
      role: "superadmin",
      assignedAt: NOW,
      assignedBy: userId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Schedule Performance",
      isActive: true,
      createdAt: NOW,
      createdBy: userId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Schedule Performance",
      curriculumId,
      students: [],
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: userId,
    });

    for (let index = 0; index < FUTURE_SCHEDULE_COUNT; index++) {
      const scheduledStart = NOW + 24 * 60 * 60 * 1_000 + index;
      await ctx.db.insert("classSchedule", {
        classId,
        sessionType: "live",
        scheduledStart,
        scheduledEnd: scheduledStart + 60 * 60 * 1_000,
        roomName: `schedule-performance-${index}`,
        status: "scheduled",
        createdAt: NOW,
        createdBy: userId,
      });
    }

    return classId;
  });

  const schedules = await t
    .withIdentity({ subject: "schedule-performance-admin" })
    .query(api.schedule.getMySchedule, {
      classId,
      now: NOW,
      includeAttendance: true,
      includeRecordings: true,
    });

  expect(schedules).toHaveLength(FUTURE_SCHEDULE_COUNT);
  expect(schedules.every((schedule) => schedule.hasRecording === false)).toBe(
    true,
  );
});

test("getMySchedule preserves attendance, recordings, recurrence, access, and ordering", async () => {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const createUser = (clerkId: string, fullName: string) => {
      const [firstName, ...lastName] = fullName.split(" ");
      return ctx.db.insert("users", {
        clerkId,
        firstName,
        lastName: lastName.join(" "),
        fullName,
        isActive: true,
        createdAt: NOW,
      });
    };
    const adminId = await createUser("schedule-functional-admin", "Ada Admin");
    const teacherId = await createUser(
      "schedule-functional-teacher",
      "Terry Teacher",
    );
    const studentId = await createUser(
      "schedule-functional-student",
      "Sam Student",
    );
    await createUser(
      "schedule-functional-outsider",
      "Olivia Outsider",
    );
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "system",
      role: "superadmin",
      assignedAt: NOW,
      assignedBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Functional Schedule",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Functional Schedule",
      curriculumId,
      teacherId,
      students: [studentId],
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const recurrenceParentId = await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: NOW - 10 * 24 * 60 * 60_000,
      scheduledEnd: NOW - 10 * 24 * 60 * 60_000 + 60 * 60_000,
      roomName: "functional-parent",
      status: "completed",
      isRecurring: true,
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      createdAt: NOW,
      createdBy: adminId,
    });
    const completedScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: NOW - 2 * 60 * 60_000,
      scheduledEnd: NOW - 60 * 60_000,
      roomName: "functional-completed",
      status: "completed",
      sessionClosureStatus: "completed",
      createdAt: NOW,
      createdBy: adminId,
    });
    const pendingScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: NOW - 50 * 60_000,
      scheduledEnd: NOW - 40 * 60_000,
      roomName: "functional-pending",
      status: "completed",
      createdAt: NOW,
      createdBy: adminId,
    });
    const activeScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: NOW - 30 * 60_000,
      scheduledEnd: NOW + 30 * 60_000,
      roomName: "functional-active",
      status: "active",
      isLive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const recurringScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      sessionType: "live",
      scheduledStart: NOW + 60 * 60_000,
      scheduledEnd: NOW + 2 * 60 * 60_000,
      roomName: "functional-recurring",
      status: "scheduled",
      recurrenceParentId,
      createdAt: NOW,
      createdBy: adminId,
    });
    await ctx.db.insert("class_sessions", {
      scheduleId: completedScheduleId,
      studentId: teacherId,
      joinedAt: NOW - 2 * 60 * 60_000,
      leftAt: NOW - 60 * 60_000,
      roomName: "functional-completed",
      sessionDate: "2026-08-29",
    });
    await ctx.db.insert("class_sessions", {
      scheduleId: activeScheduleId,
      studentId,
      joinedAt: NOW - 20 * 60_000,
      roomName: "functional-active",
      sessionDate: "2026-08-29",
    });
    await ctx.db.insert("studentAttendanceRecords", {
      scheduleId: completedScheduleId,
      studentId,
      status: "present",
      confirmedBy: teacherId,
      confirmedAt: NOW - 60 * 60_000,
      lastUpdatedBy: teacherId,
      lastUpdatedAt: NOW - 60 * 60_000,
    });
    await ctx.db.insert("recordings", {
      scheduleId: completedScheduleId,
      roomName: "functional-completed",
      egressId: "functional-egress",
      status: "complete",
      url: "https://recordings.example/functional.mp4",
      startedAt: NOW - 2 * 60 * 60_000,
      completedAt: NOW - 60 * 60_000,
    });

    return {
      classId,
      completedScheduleId,
      pendingScheduleId,
      activeScheduleId,
      recurringScheduleId,
    };
  });

  const range = {
    classId: data.classId,
    now: NOW,
    from: NOW - 3 * 60 * 60_000,
    to: NOW + 3 * 60 * 60_000,
    includeAttendance: true,
    includeRecordings: true,
  };
  const [adminSchedules, studentSchedules, outsiderSchedules] =
    await Promise.all([
      t
        .withIdentity({ subject: "schedule-functional-admin" })
        .query(api.schedule.getMySchedule, range),
      t
        .withIdentity({ subject: "schedule-functional-student" })
        .query(api.schedule.getMySchedule, range),
      t
        .withIdentity({ subject: "schedule-functional-outsider" })
        .query(api.schedule.getMySchedule, range),
    ]);

  expect(outsiderSchedules).toEqual([]);
  expect(adminSchedules.map((schedule) => schedule.scheduleId)).toEqual([
    data.completedScheduleId,
    data.pendingScheduleId,
    data.activeScheduleId,
    data.recurringScheduleId,
  ]);
  expect(
    adminSchedules.find(
      (schedule) => schedule.scheduleId === data.completedScheduleId,
    ),
  ).toMatchObject({
    hasRecording: true,
    teacherAttendance: { status: "present", minutes: 60 },
    attendanceSummary: {
      present: 1,
      pendingVerification: 0,
      verifiedTotal: 1,
      total: 1,
    },
  });
  expect(
    adminSchedules.find(
      (schedule) => schedule.scheduleId === data.pendingScheduleId,
    )?.attendanceSummary,
  ).toMatchObject({ pendingVerification: 1, verifiedTotal: 0, total: 1 });
  expect(
    adminSchedules.find(
      (schedule) => schedule.scheduleId === data.recurringScheduleId,
    )?.recurrenceRule,
  ).toBe("FREQ=WEEKLY;BYDAY=MO");
  expect(
    studentSchedules.find(
      (schedule) => schedule.scheduleId === data.completedScheduleId,
    ),
  ).toMatchObject({ attendance: "present", hasRecording: true });
  expect(
    studentSchedules.find(
      (schedule) => schedule.scheduleId === data.activeScheduleId,
    ),
  ).toMatchObject({ attendance: "in-progress", isStudentActive: true });
});
