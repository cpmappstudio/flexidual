import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  NOW,
  HOUR,
  setupClassSessionVideoTest as setup,
} from "./testHelpers/classSessionVideo.fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

test("a future publication cannot confirm teaching while its course is inactive", async () => {
  const s = await setup();
  const lessonId = await s.t.run(async (ctx) => {
    const course = await ctx.db.get(s.classId);
    return await ctx.db.insert("lessons", {
      curriculumId: course!.curriculumId,
      title: "Future taught lesson",
      order: 1,
      isActive: true,
      createdAt: NOW,
      createdBy: s.users.admin,
    });
  });
  const id = await s.teacher.mutation(internal.classSessionVideos.reserve, {
    scheduleId: s.scheduleId,
    bucket: "private-prerecorded",
    name: "lesson.mp4",
    contentType: "video/mp4",
    size: 100,
    durationMs: 60_000,
    lessonIds: [lessonId],
  });
  await s.teacher.mutation(internal.classSessionVideos.commit, { id });
  const jobsBefore = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  await s.t.run((ctx) => ctx.db.patch(s.classId, { isActive: false }));
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  await expect(
    s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await s.t.run((ctx) =>
      ctx.db.query("classPrerecordedLessonRecords").collect(),
    ),
  ).toEqual([]);
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "ready",
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(id)))?.lessonsRecordedAt,
  ).toBeUndefined();
  expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).toMatchObject({
    prerecordedVideoReleased: false,
  });
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual(jobsBefore);

  await s.t.run((ctx) => ctx.db.patch(s.classId, { isActive: true }));
  vi.setSystemTime(NOW + HOUR + 1000);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).toMatchObject({ id, released: true });
  const confirmed = await s.t.run((ctx) =>
    ctx.db.query("classPrerecordedLessonRecords").collect(),
  );
  expect(confirmed).toEqual([
    expect.objectContaining({
      lessonId,
      scheduleId: s.scheduleId,
      taughtAt: NOW + HOUR + 1000,
    }),
  ]);
  vi.setSystemTime(NOW + HOUR + 2000);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  expect(
    await s.t.run((ctx) =>
      ctx.db.query("classPrerecordedLessonRecords").collect(),
    ),
  ).toEqual(confirmed);
});
