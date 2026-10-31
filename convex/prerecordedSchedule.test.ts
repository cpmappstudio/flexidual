import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const monday = {
  dayOfWeek: 1,
  startMinutes: 9 * 60,
  durationMinutes: 60,
  sessionType: "live" as const,
};
const wednesday = { ...monday, dayOfWeek: 3 };

async function fixture(videoOnParent = true) {
  vi.useFakeTimers();
  const now = Date.parse("2026-08-01T12:00:00Z");
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      clerkId: "video-schedule-admin",
      firstName: "Ada",
      lastName: "Admin",
      fullName: "Ada Admin",
      isActive: true,
      createdAt: now,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "video-school",
      timeZone: "UTC",
      scheduleStartMinutes: 8 * 60,
      scheduleEndMinutes: 17 * 60,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "video-campus",
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      assignedAt: now,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Science",
      schoolId,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const otherCurriculumId = await ctx.db.insert("curriculums", {
      title: "Math",
      schoolId,
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId,
      name: "Term",
      startDate: "2026-08-03",
      endDate: "2026-08-31",
      createdAt: now,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Science",
      schoolId,
      campusId,
      curriculumId,
      academicPeriodId,
      timeZone: "UTC",
      students: [],
      weeklySlots: [monday],
      isActive: true,
      createdAt: now,
      createdBy: adminId,
    });
    const parentId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      scheduledStart: Date.parse("2026-08-03T09:00:00Z"),
      scheduledEnd: Date.parse("2026-08-03T10:00:00Z"),
      sessionType: "live",
      roomName: "original-parent",
      title: "Keep this lesson",
      isRecurring: true,
      recurrenceRule: JSON.stringify({ type: "weekly", daysOfWeek: [1] }),
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    const childId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      scheduledStart: Date.parse("2026-08-10T09:00:00Z"),
      scheduledEnd: Date.parse("2026-08-10T10:00:00Z"),
      sessionType: "live",
      roomName: "original-child",
      title: "Keep this child",
      isRecurring: true,
      recurrenceParentId: parentId,
      status: "scheduled",
      createdAt: now,
      createdBy: adminId,
    });
    const scheduleId = videoOnParent ? parentId : childId;
    const videoId = await ctx.db.insert("classSessionVideos", {
      scheduleId,
      classId,
      uploadedBy: adminId,
      bucket: "private-videos",
      name: "class.mp4",
      contentType: "video/mp4",
      size: 64,
      durationMs: 1000,
      state: "ready",
      createdAt: now,
    });
    await ctx.db.patch(scheduleId, {
      prerecordedVideoId: videoId,
      prerecordedVideoReleased: false,
    });
    return {
      classId,
      scheduleId,
      videoId,
      otherCurriculumId,
      parentId,
      childId,
    };
  });
  return {
    t,
    admin: t.withIdentity({ subject: "video-schedule-admin" }),
    ...data,
  };
}

afterEach(() => vi.useRealTimers());

test.each([true, false])(
  "weekly rebuild preserves exact video occurrence and recurrence links (parent=%s)",
  async (onParent) => {
    const f = await fixture(onParent);
    const original = await f.t.run((ctx) => ctx.db.get(f.scheduleId));
    await f.admin.mutation(api.classes.update, {
      classId: f.classId,
      weeklySlots: [wednesday, monday],
    });
    const state = await f.t.run(async (ctx) => ({
      schedule: await ctx.db.get(f.scheduleId),
      video: await ctx.db.get(f.videoId),
      schedules: await ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", f.classId))
        .collect(),
    }));
    expect(state.schedule).toMatchObject({
      prerecordedVideoId: f.videoId,
      scheduledStart: original!.scheduledStart,
      scheduledEnd: original!.scheduledEnd,
      roomName: original!.roomName,
      title: original!.title,
    });
    expect(state.video).toMatchObject({
      state: "ready",
      scheduleId: f.scheduleId,
    });
    for (const schedule of state.schedules) {
      if (schedule.recurrenceParentId)
        expect(
          state.schedules.some(
            (parent) => parent._id === schedule.recurrenceParentId,
          ),
        ).toBe(true);
    }
    expect(
      state.schedules.filter(
        (s) => s.scheduledStart === original!.scheduledStart,
      ),
    ).toHaveLength(1);
  },
);

test.each(["move", "remove", "curriculum"] as const)(
  "bulk %s cannot silently reassign a prerecorded lesson",
  async (change) => {
    const f = await fixture();
    const original = await f.t.run((ctx) => ctx.db.get(f.scheduleId));
    const course = await f.t.run((ctx) => ctx.db.get(f.classId));
    await expect(
      f.admin.mutation(api.classes.update, {
        classId: f.classId,
        ...(change === "curriculum"
          ? { curriculumId: f.otherCurriculumId }
          : {
              weeklySlots:
                change === "move"
                  ? [{ ...monday, startMinutes: 10 * 60 }]
                  : [wednesday],
            }),
      }),
    ).rejects.toThrow("PRERECORDED_VIDEO_SCHEDULE_CONFLICT");
    expect(await f.t.run((ctx) => ctx.db.get(f.scheduleId))).toEqual(original);
    expect(await f.t.run((ctx) => ctx.db.get(f.classId))).toEqual(course);
    expect(await f.t.run((ctx) => ctx.db.get(f.videoId))).toMatchObject({
      state: "ready",
    });
  },
);

test("explicit reschedule retains video and re-arms its server-side release", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, { prerecordedVideoReleased: true }),
  );
  await f.admin.mutation(api.schedule.updateSchedule, {
    id: f.scheduleId,
    localStart: "2026-08-04T09:00",
    durationMinutes: 60,
  });
  const state = await f.t.run(async (ctx) => ({
    schedule: await ctx.db.get(f.scheduleId),
    jobs: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
  expect(state.schedule).toMatchObject({
    prerecordedVideoId: f.videoId,
    prerecordedVideoReleased: false,
    scheduledStart: Date.parse("2026-08-04T09:00:00Z"),
  });
  expect(
    state.jobs.some(
      (job) =>
        job.scheduledTime === state.schedule!.scheduledStart &&
        job.name.includes("classSessionVideos") &&
        job.name.includes("publish"),
    ),
  ).toBe(true);
});

test("deleting a schedule retires its upload before removing schedule dependencies", async () => {
  const f = await fixture();
  await f.admin.mutation(api.schedule.deleteSchedule, { id: f.scheduleId });
  expect(await f.t.run((ctx) => ctx.db.get(f.scheduleId))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.get(f.videoId))).toMatchObject({
    state: "retired",
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.childId))).not.toBeNull();
});

test.each([false, true])(
  "cancellation revokes publication without retiring media (series=%s)",
  async (cancelSeries) => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.scheduleId, { prerecordedVideoReleased: true }),
    );
    await f.admin.mutation(api.schedule.cancelSchedule, {
      id: f.scheduleId,
      cancelSeries,
      reason: "School closure",
    });
    expect(await f.t.run((ctx) => ctx.db.get(f.scheduleId))).toMatchObject({
      status: "cancelled",
      prerecordedVideoId: f.videoId,
      prerecordedVideoReleased: false,
    });
    expect(await f.t.run((ctx) => ctx.db.get(f.videoId))).toMatchObject({
      state: "ready",
    });
    await f.admin.mutation(api.schedule.updateSchedule, {
      id: f.scheduleId,
      status: "scheduled",
    });
    expect(await f.t.run((ctx) => ctx.db.get(f.scheduleId))).toMatchObject({
      status: "scheduled",
      prerecordedVideoId: f.videoId,
      prerecordedVideoReleased: false,
    });
  },
);

test("calendar uses canonical publication flags rather than client time", async () => {
  const f = await fixture();
  const clientNow = Date.parse("2026-08-03T09:30:00Z");
  const query = () =>
    f.admin.query(api.schedule.getMySchedule, {
      now: clientNow,
      classId: f.classId,
      includeRecordings: true,
    });
  expect(
    (await query()).find((row) => row.scheduleId === f.scheduleId)
      ?.hasRecording,
  ).toBe(false);
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, { prerecordedVideoReleased: true }),
  );
  expect(
    (await query()).find((row) => row.scheduleId === f.scheduleId)
      ?.hasRecording,
  ).toBe(true);
  await f.t.run((ctx) => ctx.db.patch(f.scheduleId, { status: "cancelled" }));
  expect(
    (await query()).find((row) => row.scheduleId === f.scheduleId)
      ?.hasRecording,
  ).toBe(false);
});

test("new video preservation does not broaden schedule mutation permissions", async () => {
  const f = await fixture();
  await f.t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "video-unassigned",
      firstName: "No",
      lastName: "Access",
      fullName: "No Access",
      isActive: true,
      createdAt: Date.now(),
    }),
  );
  const other = f.t.withIdentity({ subject: "video-unassigned" });
  await expect(
    other.mutation(api.classes.update, {
      classId: f.classId,
      weeklySlots: [monday, wednesday],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    other.mutation(api.schedule.updateSchedule, {
      id: f.scheduleId,
      localStart: "2026-08-04T09:00",
      durationMinutes: 60,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    other.mutation(api.schedule.deleteSchedule, { id: f.scheduleId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(await f.t.run((ctx) => ctx.db.get(f.videoId))).toMatchObject({
    state: "ready",
  });
});
