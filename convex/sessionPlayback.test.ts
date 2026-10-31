import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { getSessionContentSummary } from "./model/sessionContent";

const NOW = Date.parse("2026-10-24T15:30:00Z");
afterEach(() => vi.useRealTimers());

async function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const teacherId = await ctx.db.insert("users", {
      clerkId: "playback-teacher",
      firstName: "Taylor",
      lastName: "Teacher",
      fullName: "Taylor Teacher",
      isActive: true,
      createdAt: NOW,
    });
    const outsiderId = await ctx.db.insert("users", {
      clerkId: "playback-outsider",
      firstName: "Other",
      lastName: "User",
      fullName: "Other User",
      isActive: true,
      createdAt: NOW,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "playback-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: teacherId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Math",
      schoolId,
      isActive: true,
      createdAt: NOW,
      createdBy: teacherId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Math",
      schoolId,
      curriculumId,
      teacherId,
      students: [],
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: teacherId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      scheduledStart: NOW - 30 * 60_000,
      scheduledEnd: NOW + 30 * 60_000,
      roomName: "playback-room",
      sessionType: "live",
      isRecurring: false,
      status: "scheduled",
      createdAt: NOW,
      createdBy: teacherId,
    });
    const videoId = await ctx.db.insert("classSessionVideos", {
      scheduleId,
      classId,
      uploadedBy: teacherId,
      bucket: "private",
      name: "lesson.mp4",
      contentType: "video/mp4",
      size: 123,
      durationMs: 3_600_000,
      state: "ready",
      createdAt: NOW,
    });
    await ctx.db.patch(scheduleId, {
      prerecordedVideoId: videoId,
      prerecordedVideoReleased: true,
    });
    // Ten completed legacy rows with missing URLs must not hide later playable parts.
    for (let i = 0; i < 10; i++)
      await ctx.db.insert("recordings", {
        scheduleId,
        roomName: "playback-room",
        egressId: `missing-${i}`,
        status: "complete",
        startedAt: i,
      });
    for (let i = 0; i < 12; i++)
      await ctx.db.insert("recordings", {
        scheduleId,
        roomName: "playback-room",
        egressId: `live-${i}`,
        status: "complete",
        url: `https://video.test/part-${i}`,
        durationMs: 1000,
        startedAt: 100 + i,
      });
    return {
      teacherId,
      outsiderId,
      classId,
      scheduleId,
      videoId,
      curriculumId,
    };
  });
  return {
    t,
    ...data,
    teacher: t.withIdentity({ subject: "playback-teacher" }),
    outsider: t.withIdentity({ subject: "playback-outsider" }),
  };
}

test("all replay parts coexist with the uploaded video while the legacy API remains unchanged", async () => {
  const f = await fixture();
  const parts = await f.teacher.query(api.recordings.getPlayback, {
    scheduleId: f.scheduleId,
  });
  expect(parts).toHaveLength(13);
  expect(parts[0]).toEqual({
    _id: f.videoId,
    prerecordedVideoId: f.videoId,
    url: null,
    durationMs: 3_600_000,
    startedAt: NOW,
  });
  expect(parts.slice(1).map((part) => part.url)).toEqual(
    Array.from({ length: 12 }, (_, i) => `https://video.test/part-${i}`),
  );
  const legacy = await f.teacher.query(api.recordings.getBySchedule, {
    scheduleId: f.scheduleId,
  });
  expect(legacy).toHaveLength(22);
  expect(
    legacy.every(
      (part) =>
        !("prerecordedVideoId" in part) &&
        "egressId" in part &&
        "fileSize" in part,
    ),
  ).toBe(true);
});

async function addPublishedLessonFacts(
  f: Awaited<ReturnType<typeof fixture>>,
  withReport = false,
) {
  return f.t.run(async (ctx) => {
    const ids = [];
    for (let order = 1; order <= 3; order++)
      ids.push(
        await ctx.db.insert("lessons", {
          curriculumId: f.curriculumId,
          title: `Lesson ${order}`,
          order,
          isActive: true,
          createdAt: NOW,
          createdBy: f.teacherId,
        }),
      );
    for (const lessonId of ids.slice(0, 2))
      await ctx.db.insert("classPrerecordedLessonRecords", {
        classId: f.classId,
        scheduleId: f.scheduleId,
        lessonId,
        taughtAt: NOW,
      });
    if (withReport) {
      const reportId = await ctx.db.insert("classSessionReports", {
        classId: f.classId,
        scheduleId: f.scheduleId,
        closedBy: f.teacherId,
        closedAt: NOW,
        notes: "Live lesson notes",
      });
      for (const lessonId of ids.slice(1))
        await ctx.db.insert("classSessionReportLessons", {
          reportId,
          classId: f.classId,
          scheduleId: f.scheduleId,
          lessonId,
        });
    }
    return ids;
  });
}

test("published prerecorded lessons remain visible without a report or current video, without inventing attendance", async () => {
  const f = await fixture();
  const ids = await addPublishedLessonFacts(f);
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, {
      prerecordedVideoId: undefined,
      prerecordedVideoReleased: false,
    }),
  );
  const record = await f.teacher.query(api.sessionRecords.get, {
    scheduleId: f.scheduleId,
    now: NOW,
  });
  expect(record).toMatchObject({
    state: "pending",
    canCompleteReport: false,
    lessons: ids
      .slice(0, 2)
      .map((lessonId, i) => ({
        lessonId,
        title: `Lesson ${i + 1}`,
        order: i + 1,
      })),
  });
  expect(record).not.toHaveProperty("staffDetails");
  expect(record).not.toHaveProperty("ownAttendance");
  expect(
    await f.t.run((ctx) => ctx.db.query("classSessionReports").collect()),
  ).toEqual([]);
  expect(
    await f.t.run((ctx) => ctx.db.query("studentAttendanceRecords").collect()),
  ).toEqual([]);
});

test("completed session lessons unite both published sources once and retain live report details", async () => {
  const f = await fixture();
  const ids = await addPublishedLessonFacts(f, true);
  const record = await f.teacher.query(api.sessionRecords.get, {
    scheduleId: f.scheduleId,
    now: NOW,
  });
  expect(record).toMatchObject({
    state: "completed",
    lessons: ids.map((lessonId, i) => ({
      lessonId,
      title: `Lesson ${i + 1}`,
      order: i + 1,
    })),
    staffDetails: {
      notes: "Live lesson notes",
      attendance: {
        summary: { present: 0, partial: 0, absent: 0, excused: 0 },
        students: [],
      },
    },
  });
  const summary = await f.t.run(async (ctx) =>
    getSessionContentSummary(ctx, (await ctx.db.get(f.scheduleId))!),
  );
  expect(summary).toEqual({
    lessonPreview: { title: "Lesson 1", order: 1 },
    hasMoreLessons: true,
    recordingCount: 1,
  });
});

test("summary deduplicates the same lesson across published sources and does not read retired video objects", async () => {
  const f = await fixture();
  const [lessonId] = await addPublishedLessonFacts(f);
  await f.t.run(async (ctx) => {
    const facts = await ctx.db
      .query("classPrerecordedLessonRecords")
      .withIndex("by_scheduleId_and_lessonId", (q) =>
        q.eq("scheduleId", f.scheduleId),
      )
      .collect();
    for (const fact of facts)
      if (fact.lessonId !== lessonId) await ctx.db.delete(fact._id);
    const reportId = await ctx.db.insert("classSessionReports", {
      classId: f.classId,
      scheduleId: f.scheduleId,
      closedBy: f.teacherId,
      closedAt: NOW,
    });
    await ctx.db.insert("classSessionReportLessons", {
      classId: f.classId,
      scheduleId: f.scheduleId,
      reportId,
      lessonId,
    });
    await ctx.db.delete(f.videoId);
    await ctx.db.patch(f.scheduleId, {
      prerecordedVideoId: undefined,
      prerecordedVideoReleased: false,
    });
  });
  const summary = await f.t.run(async (ctx) =>
    getSessionContentSummary(ctx, (await ctx.db.get(f.scheduleId))!),
  );
  expect(summary).toEqual({
    lessonPreview: { title: "Lesson 1", order: 1 },
    hasMoreLessons: false,
    recordingCount: 0,
  });
});

test("a released video is accessible during its scheduled hour without fabricating report completion", async () => {
  const f = await fixture();
  const record = await f.teacher.query(api.sessionRecords.get, {
    scheduleId: f.scheduleId,
    now: NOW,
  });
  expect(record).toMatchObject({ state: "pending", canCompleteReport: false });
  if (record.state !== "pending") throw new Error("Expected pending record");
  expect(record.recordings).toHaveLength(13);
  expect(
    await f.t.run((ctx) => ctx.db.query("classSessionReports").collect()),
  ).toEqual([]);
  expect(
    await f.t.run((ctx) => ctx.db.query("studentAttendanceRecords").collect()),
  ).toEqual([]);
});

test("release, current attachment and course permissions are checked on every shared playback read", async () => {
  const f = await fixture();
  expect(
    await f.outsider.query(api.recordings.getPlayback, {
      scheduleId: f.scheduleId,
    }),
  ).toEqual([]);
  expect(
    await f.t.query(api.recordings.getPlayback, { scheduleId: f.scheduleId }),
  ).toEqual([]);
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, { prerecordedVideoReleased: false }),
  );
  expect(
    await f.teacher.query(api.recordings.getPlayback, {
      scheduleId: f.scheduleId,
    }),
  ).toHaveLength(12);
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, {
      prerecordedVideoReleased: true,
      prerecordedVideoId: undefined,
    }),
  );
  expect(
    await f.teacher.query(api.recordings.getPlayback, {
      scheduleId: f.scheduleId,
    }),
  ).toHaveLength(12);
  await f.t.run((ctx) => ctx.db.patch(f.classId, { teacherId: f.outsiderId }));
  expect(
    await f.teacher.query(api.recordings.getPlayback, {
      scheduleId: f.scheduleId,
    }),
  ).toEqual([]);
});
