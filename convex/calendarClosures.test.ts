import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import { localDateTimeToUtc } from "../lib/time-zone";

const NOW = localDateTimeToUtc("2026-09-01T12:00", "UTC");
const TARGET_DATE = "2026-09-02";

afterEach(() => {
  vi.useRealTimers();
});

async function setupCalendarClosureTest() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const insertUser = (clerkId: string, fullName: string) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@example.com`,
        firstName: fullName.split(" ")[0],
        lastName: fullName.split(" ")[1] ?? "User",
        fullName,
        isActive: true,
        createdAt: NOW,
      });
    const adminId = await insertUser("closure-admin", "Ada Admin");
    const principalId = await insertUser(
      "closure-principal",
      "Priya Principal",
    );
    const teacherId = await insertUser("closure-teacher", "Taylor Teacher");
    const providerTeacherId = await insertUser(
      "closure-provider-teacher",
      "Parker Teacher",
    );
    const studentId = await insertUser("closure-student", "Sam Student");
    const schoolId = await ctx.db.insert("schools", {
      name: "Closure School",
      slug: "closure-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Main Campus",
      slug: "closure-main",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const otherCampusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Other Campus",
      slug: "closure-other",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    await ctx.db.insert("institutionGrades", {
      schoolId,
      code: "08",
      name: "8th Grade",
      order: 8,
      createdAt: NOW,
      createdBy: adminId,
    });
    await ctx.db.insert("institutionGrades", {
      schoolId,
      code: "09",
      name: "9th Grade",
      order: 9,
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
    await ctx.db.insert("roleAssignments", {
      userId: principalId,
      orgId: campusId,
      orgType: "campus",
      role: "principal",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: teacherId,
      orgId: campusId,
      orgType: "campus",
      role: "teacher",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: studentId,
      orgId: campusId,
      orgType: "campus",
      role: "student",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: providerTeacherId,
      orgId: campusId,
      orgType: "campus",
      role: "teacher",
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Mathematics",
      schoolId,
      gradeCodes: ["08", "09"],
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "September 2026",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      createdAt: NOW,
      createdBy: adminId,
    });
    const insertClass = (
      name: string,
      campus: Id<"campuses">,
      gradeCode: string,
    ) =>
      ctx.db.insert("classes", {
        name,
        curriculumId,
        teacherId,
        students: [studentId],
        schoolId,
        campusId: campus,
        gradeCode,
        isActive: true,
        createdAt: NOW,
        createdBy: adminId,
      });
    const classId = await insertClass("Mathematics 8", campusId, "08");
    const otherGradeClassId = await insertClass(
      "Mathematics 9",
      campusId,
      "09",
    );
    const otherCampusClassId = await insertClass(
      "Other Mathematics 8",
      otherCampusId,
      "08",
    );
    const insertSchedule = (
      targetClassId: Id<"classes">,
      roomName: string,
      start: string,
      end: string,
      status: "scheduled" | "cancelled" = "scheduled",
      sessionType: "live" | "ignitia" | "abeka" = "live",
    ) =>
      ctx.db.insert("classSchedule", {
        classId: targetClassId,
        schoolId,
        sessionType,
        scheduledStart: localDateTimeToUtc(`${TARGET_DATE}T${start}`, "UTC"),
        scheduledEnd: localDateTimeToUtc(`${TARGET_DATE}T${end}`, "UTC"),
        roomName,
        status,
        ...(status === "cancelled"
          ? {
              cancellationReason: "Previously cancelled",
              cancelledAt: NOW,
              cancelledBy: adminId,
              cancellationScope: "occurrence" as const,
              cancellationEffectiveAt: localDateTimeToUtc(
                `${TARGET_DATE}T${start}`,
                "UTC",
              ),
            }
          : {}),
        createdAt: NOW,
        createdBy: adminId,
      });

    const boundaryBeforeId = await insertSchedule(
      classId,
      "before",
      "08:00",
      "09:00",
    );
    const partialStartId = await insertSchedule(
      classId,
      "partial-start",
      "08:30",
      "09:30",
      "scheduled",
      "abeka",
    );
    const containedId = await insertSchedule(
      classId,
      "contained",
      "09:30",
      "10:30",
      "scheduled",
      "ignitia",
    );
    const partialEndId = await insertSchedule(
      classId,
      "partial-end",
      "11:30",
      "12:30",
    );
    const boundaryAfterId = await insertSchedule(
      classId,
      "after",
      "12:00",
      "13:00",
    );
    const alreadyCancelledId = await insertSchedule(
      classId,
      "cancelled",
      "10:30",
      "11:00",
      "cancelled",
    );
    const otherGradeId = await insertSchedule(
      otherGradeClassId,
      "other-grade",
      "10:00",
      "11:00",
    );
    const otherCampusScheduleId = await insertSchedule(
      otherCampusClassId,
      "other-campus",
      "10:00",
      "11:00",
    );

    return {
      adminId,
      principalId,
      teacherId,
      providerTeacherId,
      studentId,
      schoolId,
      campusId,
      curriculumId,
      academicPeriodId,
      classId,
      boundaryBeforeId,
      partialStartId,
      containedId,
      partialEndId,
      boundaryAfterId,
      alreadyCancelledId,
      otherGradeId,
      otherCampusId: otherCampusScheduleId,
    };
  });
  return { t, data };
}

test("preview distinguishes contained, partial, boundary, scope, and cancelled classes", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const preview = await t
    .withIdentity({ subject: "closure-admin" })
    .query(api.calendarClosures.preview, {
      schoolId: data.schoolId,
      campusId: data.campusId,
      gradeCode: "08",
      localDate: TARGET_DATE,
      isAllDay: false,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
      now: NOW,
    });

  expect(preview.contained.map((item) => item.scheduleId)).toEqual([
    data.containedId,
  ]);
  expect(preview.partial.map((item) => item.scheduleId)).toEqual([
    data.partialStartId,
    data.partialEndId,
  ]);
  expect(preview.alreadyCancelledCount).toBe(1);
  expect(
    preview.contained.some((item) =>
      [
        data.boundaryBeforeId,
        data.boundaryAfterId,
        data.otherGradeId,
        data.otherCampusId,
      ].includes(item.scheduleId),
    ),
  ).toBe(false);
});

test("a closure cancels contained and explicitly selected partial classes", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const result = await t
    .withIdentity({ subject: "closure-admin" })
    .mutation(api.calendarClosures.create, {
      schoolId: data.schoolId,
      campusId: data.campusId,
      gradeCode: "08",
      localDate: TARGET_DATE,
      isAllDay: false,
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
      reason: "Institutional activity",
      selectedPartialScheduleIds: [data.partialStartId],
    });
  expect(result.selectedCount).toBe(2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const state = await t.run(async (ctx) => ({
    closure: await ctx.db.get("calendarClosures", result.closureId),
    contained: await ctx.db.get("classSchedule", data.containedId),
    selectedPartial: await ctx.db.get("classSchedule", data.partialStartId),
    unselectedPartial: await ctx.db.get("classSchedule", data.partialEndId),
    boundary: await ctx.db.get("classSchedule", data.boundaryAfterId),
    events: (await ctx.db.query("classCancellationEvents").collect()).filter(
      (event) => event.calendarClosureId === result.closureId,
    ),
    notifications: (await ctx.db.query("systemNotifications").collect()).filter(
      (notification) => notification.kind === "calendar_closure",
    ),
  }));
  expect(state.closure).toMatchObject({
    status: "completed",
    selectedCount: 2,
    cancelledCount: 2,
    skippedCount: 0,
  });
  for (const schedule of [state.contained, state.selectedPartial]) {
    expect(schedule).toMatchObject({
      status: "cancelled",
      cancellationReason: "Institutional activity",
      calendarClosureId: result.closureId,
      cancellationScope: "occurrence",
    });
  }
  expect(state.unselectedPartial?.status).toBe("scheduled");
  expect(state.boundary?.status).toBe("scheduled");
  expect(state.events).toHaveLength(2);
  expect(
    state.events.every((event) => event.source === "calendar_closure"),
  ).toBe(true);
  expect(state.notifications).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        recipientId: data.teacherId,
        calendarClosureId: result.closureId,
      }),
      expect.objectContaining({
        recipientId: data.studentId,
        calendarClosureId: result.closureId,
      }),
    ]),
  );
  expect(
    state.notifications.some(
      (notification) => notification.recipientId === data.adminId,
    ),
  ).toBe(false);
});

test("principals can mark their entire campus day while teachers cannot create closures", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const input = {
    schoolId: data.schoolId,
    campusId: data.campusId,
    localDate: TARGET_DATE,
    isAllDay: true,
    reason: "Campus activity",
    selectedPartialScheduleIds: [],
  };

  await expect(
    t
      .withIdentity({ subject: "closure-principal" })
      .mutation(api.calendarClosures.create, input),
  ).resolves.toMatchObject({ selectedCount: 6 });
  await expect(
    t
      .withIdentity({ subject: "closure-teacher" })
      .mutation(api.calendarClosures.create, input),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("an institution day covers every campus and remains visible to campus students", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const result = await t
    .withIdentity({ subject: "closure-admin" })
    .mutation(api.calendarClosures.create, {
      schoolId: data.schoolId,
      localDate: TARGET_DATE,
      isAllDay: true,
      reason: "National holiday",
      selectedPartialScheduleIds: [],
    });
  expect(result.selectedCount).toBe(7);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [otherCampusSchedule, visibleClosures, studentNotification] =
    await Promise.all([
      t.run((ctx) => ctx.db.get("classSchedule", data.otherCampusId)),
      t
        .withIdentity({ subject: "closure-student" })
        .query(api.calendarClosures.listForRange, {
          schoolId: data.schoolId,
          campusId: data.campusId,
          from: localDateTimeToUtc(`${TARGET_DATE}T00:00`, "UTC"),
          to: localDateTimeToUtc("2026-09-03T00:00", "UTC"),
        }),
      t.run(async (ctx) =>
        (
          await ctx.db
            .query("systemNotifications")
            .withIndex("by_recipient_and_created_at", (query) =>
              query.eq("recipientId", data.studentId),
            )
            .collect()
        ).find(
          (notification) => notification.calendarClosureId === result.closureId,
        ),
      ),
    ]);
  expect(otherCampusSchedule).toMatchObject({
    status: "cancelled",
    calendarClosureId: result.closureId,
  });
  const visibleClosure = visibleClosures.find(
    (closure) => closure._id === result.closureId,
  );
  expect(visibleClosure).toBeDefined();
  expect(visibleClosure).not.toHaveProperty("campusId");
  expect(visibleClosure).not.toHaveProperty("gradeCode");
  expect(studentNotification).toMatchObject({
    schoolId: data.schoolId,
    campusId: data.campusId,
    organizationSlug: "closure-main",
    schoolName: "Closure School",
  });
  expect(studentNotification).not.toHaveProperty("campusName");
});

test("a same-day closure cancels earlier scheduled classes without changing active or completed classes", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const localDate = "2026-09-01";
  const scheduleIds = await t.run(async (ctx) => {
    const insertSchedule = (
      roomName: string,
      status: "scheduled" | "active" | "completed",
    ) =>
      ctx.db.insert("classSchedule", {
        classId: data.classId,
        schoolId: data.schoolId,
        sessionType: "live",
        scheduledStart: localDateTimeToUtc(`${localDate}T08:00`, "UTC"),
        scheduledEnd: localDateTimeToUtc(`${localDate}T08:40`, "UTC"),
        roomName,
        status,
        createdAt: NOW,
        createdBy: data.adminId,
      });

    return {
      scheduled: await insertSchedule("late-scheduled", "scheduled"),
      active: await insertSchedule("late-active", "active"),
      completed: await insertSchedule("late-completed", "completed"),
    };
  });

  const result = await t
    .withIdentity({ subject: "closure-admin" })
    .mutation(api.calendarClosures.create, {
      schoolId: data.schoolId,
      campusId: data.campusId,
      localDate,
      isAllDay: true,
      reason: "Public holiday",
      selectedPartialScheduleIds: [],
    });
  expect(result.selectedCount).toBe(1);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const state = await t.run(async (ctx) => ({
    scheduled: await ctx.db.get("classSchedule", scheduleIds.scheduled),
    active: await ctx.db.get("classSchedule", scheduleIds.active),
    completed: await ctx.db.get("classSchedule", scheduleIds.completed),
  }));
  expect(state.scheduled).toMatchObject({
    status: "cancelled",
    calendarClosureId: result.closureId,
  });
  expect(state.active?.status).toBe("active");
  expect(state.completed?.status).toBe("completed");
});

test("the worker processes more than one schedule page without skipping classes", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const extraScheduleIds = await t.run(async (ctx) => {
    const ids: Id<"classSchedule">[] = [];
    for (let index = 0; index < 25; index++) {
      ids.push(
        await ctx.db.insert("classSchedule", {
          classId: data.classId,
          schoolId: data.schoolId,
          sessionType: "live",
          scheduledStart: localDateTimeToUtc(
            `${TARGET_DATE}T${String(13 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10).padStart(2, "0")}`,
            "UTC",
          ),
          scheduledEnd: localDateTimeToUtc(
            `${TARGET_DATE}T${String(13 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 10 + 9).padStart(2, "0")}`,
            "UTC",
          ),
          roomName: `batch-${index}`,
          status: "scheduled",
          createdAt: NOW,
          createdBy: data.adminId,
        }),
      );
    }
    return ids;
  });

  await t.run(async (ctx) => {
    for (const scheduleId of [
      extraScheduleIds[0],
      extraScheduleIds[extraScheduleIds.length - 1],
    ]) {
      await ctx.db.insert("systemNotifications", {
        recipientId: data.studentId,
        kind: "class_starting_soon",
        scheduleId,
        dedupeKey: `class_starting_soon:${scheduleId}:${data.studentId}`,
        createdAt: NOW,
      });
    }
  });

  const result = await t
    .withIdentity({ subject: "closure-admin" })
    .mutation(api.calendarClosures.create, {
      schoolId: data.schoolId,
      campusId: data.campusId,
      gradeCode: "08",
      localDate: TARGET_DATE,
      isAllDay: true,
      reason: "Full campus day",
      selectedPartialScheduleIds: [],
    });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const state = await t.run(async (ctx) => ({
    schedules: await Promise.all(
      extraScheduleIds.map((id) => ctx.db.get("classSchedule", id)),
    ),
    closure: await ctx.db.get("calendarClosures", result.closureId),
    closureNotifications: (
      await ctx.db.query("systemNotifications").collect()
    ).filter(
      (notification) =>
        notification.kind === "calendar_closure" &&
        notification.calendarClosureId === result.closureId,
    ),
    startingSoonNotifications: (
      await ctx.db.query("systemNotifications").collect()
    ).filter(
      (notification) =>
        notification.kind === "class_starting_soon" &&
        notification.scheduleId !== undefined &&
        extraScheduleIds.includes(notification.scheduleId),
    ),
  }));
  expect(
    state.schedules.every((schedule) => schedule?.status === "cancelled"),
  ).toBe(true);
  expect(state.closure?.status).toBe("completed");
  expect(state.closureNotifications).toHaveLength(2);
  expect(
    new Set(
      state.closureNotifications.map((notification) =>
        notification.recipientId.toString(),
      ),
    ),
  ).toEqual(new Set([data.teacherId.toString(), data.studentId.toString()]));
  expect(state.startingSoonNotifications).toHaveLength(0);
});

test("newly generated schedules honor an existing closure for every provider", async () => {
  const { t, data } = await setupCalendarClosureTest();
  const closureId = await t.run((ctx) =>
    ctx.db.insert("calendarClosures", {
      schoolId: data.schoolId,
      campusId: data.campusId,
      gradeCode: "08",
      localDate: TARGET_DATE,
      timeZone: "UTC",
      startsAt: localDateTimeToUtc(`${TARGET_DATE}T00:00`, "UTC"),
      endsAt: localDateTimeToUtc("2026-09-03T00:00", "UTC"),
      isAllDay: true,
      reason: "Public holiday",
      status: "completed",
      selectedCount: 0,
      cancelledCount: 0,
      skippedCount: 0,
      createdBy: data.adminId,
      createdAt: NOW,
      completedAt: NOW,
    }),
  );

  const result = await t
    .withIdentity({ subject: "closure-admin" })
    .mutation(api.classes.createWithSchedule, {
      name: "Provider course",
      curriculumId: data.curriculumId,
      campusId: data.campusId,
      teacherId: data.providerTeacherId,
      academicPeriodId: data.academicPeriodId,
      gradeCode: "08",
      studentIds: [],
      liveAccess: { mode: "private", allowedGradeCodes: [] },
      weeklySlots: [
        {
          dayOfWeek: 3,
          startMinutes: 8 * 60,
          durationMinutes: 40,
          sessionType: "live",
        },
        {
          dayOfWeek: 3,
          startMinutes: 9 * 60,
          durationMinutes: 40,
          sessionType: "abeka",
        },
        {
          dayOfWeek: 3,
          startMinutes: 10 * 60,
          durationMinutes: 40,
          sessionType: "ignitia",
        },
      ],
    });

  const state = await t.run(async (ctx) => ({
    schedules: await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (index) => index.eq("classId", result.classId))
      .collect(),
    events: (await ctx.db.query("classCancellationEvents").collect()).filter(
      (event) => event.calendarClosureId === closureId,
    ),
  }));
  expect(state.schedules).toHaveLength(3);
  expect(
    state.schedules.map((schedule) => schedule.sessionType).sort(),
  ).toEqual(["abeka", "ignitia", "live"]);
  expect(
    state.schedules.every(
      (schedule) =>
        schedule.status === "cancelled" &&
        schedule.calendarClosureId === closureId &&
        schedule.cancellationReason === "Public holiday",
    ),
  ).toBe(true);
  expect(state.events).toHaveLength(3);
});
