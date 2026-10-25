import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  HOUR,
  NOW,
  setupClassSessionVideoTest as setup,
} from "./testHelpers/classSessionVideo.fixture";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

test("calendar and course upcoming entries share teacher permissions without reading video files", async () => {
  const s = await setup();
  await s.ready();
  for (const viewer of [s.teacher, s.multigrade, s.admin]) {
    const course = await viewer.query(api.schedule.getMySchedule, {
      classId: s.classId,
      now: NOW,
      includeAttendance: false,
      includeRecordings: false,
    });
    const calendar = await viewer.query(api.calendar.listEvents, {
      classId: s.classId,
      from: NOW,
      to: NOW + 3 * HOUR,
    });
    expect(
      course.find((event) => event.scheduleId === s.scheduleId),
    ).toMatchObject({ hasPrerecorded: true, canManagePrerecorded: true });
    expect(
      calendar.find((event) => event.scheduleId === s.scheduleId),
    ).toMatchObject({ hasPrerecorded: true, canManagePrerecorded: true });
  }
});

test("students and tutors have no upload controls and cannot discover an unreleased video through lists", async () => {
  const s = await setup();
  const id = await s.ready();
  for (const viewer of [s.student, s.tutor]) {
    const events = await viewer.query(api.calendar.listEvents, {
      classId: s.classId,
      from: NOW,
      to: NOW + 3 * HOUR,
    });
    expect(
      events.find((event) => event.scheduleId === s.scheduleId),
    ).toMatchObject({
      hasPrerecorded: false,
      canManagePrerecorded: false,
      hasRecording: false,
    });
  }
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  for (const viewer of [s.student, s.tutor]) {
    const events = await viewer.query(api.calendar.listEvents, {
      classId: s.classId,
      from: NOW,
      to: NOW + 3 * HOUR,
    });
    expect(
      events.find((event) => event.scheduleId === s.scheduleId),
    ).toMatchObject({
      hasPrerecorded: true,
      canManagePrerecorded: false,
      hasRecording: true,
    });
  }
});

test.each(["abeka", "ignitia"] as const)(
  "%s entries retain their external destination without upload actions",
  async (sessionType) => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.scheduleId, { sessionType }));
    const calendar = await s.teacher.query(api.calendar.listEvents, {
      classId: s.classId,
      from: NOW,
      to: NOW + 3 * HOUR,
    });
    const course = await s.teacher.query(api.schedule.getMySchedule, {
      classId: s.classId,
      now: NOW,
      includeAttendance: false,
      includeRecordings: false,
    });
    for (const events of [calendar, course])
      expect(events[0]).toMatchObject({
        sessionType,
        canManagePrerecorded: false,
        hasPrerecorded: false,
      });
  },
);
