import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  NOW,
  HOUR,
  setupClassSessionVideoTest as setup,
} from "./testHelpers/classSessionVideo.fixture";
import { getCourseLessonHistory } from "./model/courseProgress";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function lessonFixture() {
  const s = await setup();
  const data = await s.t.run(async (ctx) => {
    const course = await ctx.db.get("classes", s.classId);
    const otherCurriculumId = await ctx.db.insert("curriculums", {
      title: "Other",
      schoolId: s.schoolId,
      isActive: true,
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    const createLesson = (
      title: string,
      order: number,
      isActive = true,
      curriculumId = course!.curriculumId,
    ) =>
      ctx.db.insert("lessons", {
        title,
        order,
        isActive,
        curriculumId,
        createdAt: NOW,
        createdBy: s.users.admin,
      });
    return {
      first: await createLesson("First lesson", 1),
      second: await createLesson("Second lesson", 2),
      inactive: await createLesson("Inactive", 3, false),
      foreign: await createLesson("Foreign", 4, true, otherCurriculumId),
    };
  });
  const reserve = (lessonIds: Id<"lessons">[], scheduleId = s.scheduleId) =>
    s.teacher.mutation(internal.classSessionVideos.reserve, {
      scheduleId,
      bucket: "private-prerecorded",
      name: "lesson.mp4",
      size: 100,
      contentType: "video/mp4",
      durationMs: 60_000,
      lessonIds,
    });
  const commit = async (
    lessonIds: Id<"lessons">[],
    scheduleId = s.scheduleId,
  ) => {
    const id = await reserve(lessonIds, scheduleId);
    await s.teacher.mutation(internal.classSessionVideos.commit, { id });
    return id;
  };
  const publish = (id: Id<"classSessionVideos">, scheduledStart = NOW + HOUR) =>
    s.t.mutation(internal.classSessionVideos.publish, { id, scheduledStart });
  const progress = () =>
    s.teacher.query(api.lessons.getClassCurriculumProgress, {
      classId: s.classId,
    });
  return {
    ...s,
    ...data,
    reserveLessons: reserve,
    commitLessons: commit,
    publish,
    progress,
  };
}

test.each(["teacher", "multigrade", "admin"] as const)(
  "%s sees institutional management context and selected lessons before release",
  async (role) => {
    const s = await lessonFixture();
    const id = await s.commitLessons([s.second]);
    const context = await s[role].query(
      api.classSessionVideos.getManagementContext,
      { scheduleId: s.scheduleId },
    );
    expect(context).toMatchObject({
      scheduledStart: NOW + HOUR,
      timeZone: "America/Tegucigalpa",
      video: { id, lessonIds: [s.second], released: false },
      lessons: [
        { lessonId: s.first, selected: false, previousSessionCount: 0 },
        { lessonId: s.second, selected: true, previousSessionCount: 0 },
      ],
    });
    expect(context?.lessons).toHaveLength(2);
    expect(
      await s.student.query(api.classSessionVideos.getForSchedule, {
        scheduleId: s.scheduleId,
      }),
    ).toBeNull();
  },
);

test.each(["student", "tutor", "unassigned", "outsideAdmin"] as const)(
  "%s cannot read manager lesson selections",
  async (role) => {
    const s = await lessonFixture();
    expect(
      await s[role].query(api.classSessionVideos.getManagementContext, {
        scheduleId: s.scheduleId,
      }),
    ).toBeNull();
  },
);

test("unavailable contexts return null rather than exposing manager metadata", async () => {
  const s = await lessonFixture();
  expect(
    await s.t.query(api.classSessionVideos.getManagementContext, {
      scheduleId: s.scheduleId,
    }),
  ).toBeNull();
  for (const patch of [
    { status: "cancelled" as const },
    { status: "scheduled" as const, sessionType: "abeka" as const },
  ]) {
    await s.t.run((ctx) => ctx.db.patch(s.scheduleId, patch));
    expect(
      await s.teacher.query(api.classSessionVideos.getManagementContext, {
        scheduleId: s.scheduleId,
      }),
    ).toBeNull();
  }
});

test.each(["inactive", "foreign", "duplicate", "tooMany"] as const)(
  "reservation rejects %s taught lesson selections",
  async (kind) => {
    const s = await lessonFixture();
    const ids =
      kind === "duplicate"
        ? [s.first, s.first]
        : kind === "tooMany"
          ? Array.from({ length: 501 }, () => s.first)
          : [s[kind]];
    await expect(s.reserveLessons(ids)).rejects.toThrow(
      "INVALID_TAUGHT_LESSON_SELECTION",
    );
    expect(
      await s.t.run((ctx) => ctx.db.query("classSessionVideos").collect()),
    ).toEqual([]);
  },
);

test("commit revalidates curriculum lessons changed during upload without replacing the ready file", async () => {
  const s = await lessonFixture();
  const previous = await s.ready();
  const pending = await s.reserveLessons([s.first]);
  await s.t.run((ctx) => ctx.db.patch(s.first, { isActive: false }));
  await expect(
    s.teacher.mutation(internal.classSessionVideos.commit, { id: pending }),
  ).rejects.toThrow("INVALID_TAUGHT_LESSON_SELECTION");
  expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).toMatchObject({
    prerecordedVideoId: previous,
  });
  expect(await s.t.run((ctx) => ctx.db.get(previous))).toMatchObject({
    state: "ready",
  });
});

test("lessons count only at server publication without reports, attendance or sessions", async () => {
  const s = await lessonFixture();
  const id = await s.commitLessons([s.first]);
  expect(await s.progress()).toMatchObject({ taughtLessons: 0 });
  await s.publish(id);
  expect(await s.progress()).toMatchObject({ taughtLessons: 0 });
  vi.setSystemTime(NOW + HOUR);
  await s.publish(id);
  expect(await s.progress()).toMatchObject({
    taughtLessons: 1,
    percentage: 50,
    lessons: [
      { _id: s.first, sessionCount: 1, lastTaughtAt: NOW + HOUR },
      { _id: s.second, sessionCount: 0 },
    ],
  });
  expect(
    await s.t.run(async (ctx) => ({
      reports: await ctx.db.query("classSessionReports").collect(),
      attendance: await ctx.db.query("studentAttendanceRecords").collect(),
      sessions: await ctx.db.query("class_sessions").collect(),
    })),
  ).toEqual({ reports: [], attendance: [], sessions: [] });
  const before = await s.t.run((ctx) =>
    ctx.db.query("classPrerecordedLessonRecords").collect(),
  );
  vi.setSystemTime(NOW + HOUR + 1000);
  await s.publish(id);
  expect(
    await s.t.run((ctx) =>
      ctx.db.query("classPrerecordedLessonRecords").collect(),
    ),
  ).toEqual(before);
});

test("live and prerecorded teaching of the same lesson count once per occurrence", async () => {
  const s = await lessonFixture();
  const id = await s.commitLessons([s.first]);
  vi.setSystemTime(NOW + HOUR);
  await s.publish(id);
  const another = await s.t.run(async (ctx) => {
    const report = await ctx.db.insert("classSessionReports", {
      classId: s.classId,
      scheduleId: s.scheduleId,
      closedBy: s.users.teacher,
      closedAt: NOW + 2 * HOUR,
    });
    await ctx.db.insert("classSessionReportLessons", {
      reportId: report,
      classId: s.classId,
      scheduleId: s.scheduleId,
      lessonId: s.first,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId: s.classId,
      roomName: "another",
      scheduledStart: NOW + 3 * HOUR,
      scheduledEnd: NOW + 4 * HOUR,
      status: "scheduled",
      createdAt: NOW,
      createdBy: s.users.admin,
    });
    await ctx.db.insert("classPrerecordedLessonRecords", {
      classId: s.classId,
      scheduleId,
      lessonId: s.first,
      taughtAt: NOW + 3 * HOUR,
    });
    return scheduleId;
  });
  expect((await s.progress())?.lessons[0]).toMatchObject({
    sessionCount: 2,
    lastTaughtAt: NOW + 3 * HOUR,
  });
  const history = await s.t.run(async (ctx) =>
    (await getCourseLessonHistory(ctx, s.classId, another)).get(s.first),
  );
  expect(history).toEqual({
    count: 1,
    lastRecordedAt: NOW + 2 * HOUR,
  });
  expect(
    (
      await s.teacher.query(api.classSessionVideos.getManagementContext, {
        scheduleId: another,
      })
    )?.lessons[0],
  ).toMatchObject({ previousSessionCount: 1, lastRecordedAt: NOW + 2 * HOUR });
});

test("replacing and removing a published file preserves confirmed teaching history", async () => {
  const s = await lessonFixture();
  const firstVideo = await s.commitLessons([s.first]);
  vi.setSystemTime(NOW + HOUR);
  await s.publish(firstVideo);
  const replacement = await s.commitLessons([s.first, s.second]);
  expect(await s.progress()).toMatchObject({ taughtLessons: 2 });
  expect(
    (await s.progress())?.lessons.map((lesson) => lesson.sessionCount),
  ).toEqual([1, 1]);
  await s.teacher.mutation(api.classSessionVideos.remove, {
    scheduleId: s.scheduleId,
    expectedVideoId: replacement,
  });
  expect(await s.progress()).toMatchObject({ taughtLessons: 2 });
  expect(
    await s.t.run((ctx) => ctx.db.query("classSessionReports").collect()),
  ).toEqual([]);
});

test("stale, cancelled and rescheduled publication jobs cannot confirm lessons early", async () => {
  const s = await lessonFixture();
  const id = await s.commitLessons([s.first]);
  await s.t.run((ctx) =>
    ctx.db.patch(s.scheduleId, { scheduledStart: NOW + 2 * HOUR }),
  );
  vi.setSystemTime(NOW + HOUR);
  await s.publish(id);
  await s.publish(id, NOW + 2 * HOUR);
  expect(await s.progress()).toMatchObject({ taughtLessons: 0 });
  await s.t.run((ctx) => ctx.db.patch(s.scheduleId, { status: "cancelled" }));
  vi.setSystemTime(NOW + 2 * HOUR);
  await s.publish(id, NOW + 2 * HOUR);
  expect(await s.progress()).toMatchObject({ taughtLessons: 0 });
  await s.t.run((ctx) => ctx.db.patch(s.scheduleId, { status: "scheduled" }));
  await s.publish(id, NOW + 2 * HOUR);
  expect(await s.progress()).toMatchObject({ taughtLessons: 1 });
});

test("inactive lessons changed after commit do not block video release or create false teaching records", async () => {
  const s = await lessonFixture();
  const id = await s.commitLessons([s.first]);
  await s.t.run((ctx) => ctx.db.patch(s.first, { isActive: false }));
  vi.setSystemTime(NOW + HOUR);
  await s.publish(id);
  expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).toMatchObject({
    prerecordedVideoReleased: true,
  });
  expect(
    await s.t.run((ctx) =>
      ctx.db.query("classPrerecordedLessonRecords").collect(),
    ),
  ).toEqual([]);
});

test("confirmed lessons cannot be deleted, and explicit session deletion removes its confirmations", async () => {
  const s = await lessonFixture();
  const id = await s.commitLessons([s.first]);
  vi.setSystemTime(NOW + HOUR);
  await s.publish(id);
  await expect(
    s.admin.mutation(api.lessons.remove, { id: s.first }),
  ).rejects.toThrow("RECORDED_LESSON_CANNOT_BE_DELETED");
  await s.admin.mutation(api.schedule.deleteSchedule, { id: s.scheduleId });
  expect(
    await s.t.run((ctx) =>
      ctx.db.query("classPrerecordedLessonRecords").collect(),
    ),
  ).toEqual([]);
  expect(await s.progress()).toMatchObject({ taughtLessons: 0 });
});
