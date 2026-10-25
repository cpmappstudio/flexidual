import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { syncPrerecordedRelease } from "./model/classSessionVideos";
import { SESSION_VIDEO_UPLOAD_TTL_MS } from "../lib/class-session-video";
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

test.each(["teacher", "multigrade", "admin"] as const)(
  "%s can attach a prerecorded video to the assigned course occurrence",
  async (role) => {
    const s = await setup();
    const id = await s.reserve(s[role]);
    await s[role].mutation(internal.classSessionVideos.commit, { id });
    expect(
      await s[role].query(api.classSessionVideos.getForSchedule, {
        scheduleId: s.scheduleId,
      }),
    ).toMatchObject({ id, released: false, scheduledStart: NOW + HOUR });
    expect(
      await s.t.run((ctx) => ctx.db.get("classSessionVideos", id)),
    ).toMatchObject({
      uploadedBy: s.users[role],
      classId: s.classId,
      state: "ready",
    });
  },
);

test.each(["student", "tutor", "unassigned", "outsideAdmin"] as const)(
  "%s cannot upload or remove the course video",
  async (role) => {
    const s = await setup();
    const id = await s.ready();
    await expect(s.reserve(s[role])).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      s[role].mutation(api.classSessionVideos.remove, {
        scheduleId: s.scheduleId,
        expectedVideoId: id,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    expect(
      (await s.t.run((ctx) => ctx.db.get("classSchedule", s.scheduleId)))
        ?.prerecordedVideoId,
    ).toBe(id);
  },
);

test("parallel reservations compare-and-swap on completion without losing the winning replacement", async () => {
  const s = await setup();
  const previous = await s.ready();
  const [first, second] = await Promise.all([
    s.reserve(),
    s.reserve(s.multigrade),
  ]);
  await s.teacher.mutation(internal.classSessionVideos.commit, { id: first });
  await expect(
    s.multigrade.mutation(internal.classSessionVideos.commit, { id: second }),
  ).rejects.toThrow("SESSION_VIDEO_CONFLICT");
  await s.multigrade.mutation(api.classSessionVideos.cancel, { id: second });
  const documents = await s.t.run(async (ctx) => ({
    schedule: await ctx.db.get("classSchedule", s.scheduleId),
    previous: await ctx.db.get("classSessionVideos", previous),
    winner: await ctx.db.get("classSessionVideos", first),
    loser: await ctx.db.get("classSessionVideos", second),
  }));
  expect(documents.schedule?.prerecordedVideoId).toBe(first);
  expect(documents.winner?.state).toBe("ready");
  expect(documents.previous?.state).toBe("retired");
  expect(documents.loser?.state).toBe("retired");
  await expect(
    s.teacher.mutation(api.classSessionVideos.remove, {
      scheduleId: s.scheduleId,
      expectedVideoId: previous,
    }),
  ).rejects.toThrow("SESSION_VIDEO_CONFLICT");
});

test("commit retries are idempotent and do not create publication jobs or academic activity twice", async () => {
  const s = await setup();
  const id = await s.ready();
  const jobsBefore = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  await s.teacher.mutation(internal.classSessionVideos.commit, { id });
  expect(
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual(jobsBefore);
  expect(
    await s.t.run(async (ctx) => ({
      videos: await ctx.db.query("classSessionVideos").collect(),
      attendance: await ctx.db.query("studentAttendanceRecords").collect(),
      reports: await ctx.db.query("classSessionReports").collect(),
      sessions: await ctx.db.query("class_sessions").collect(),
      recordings: await ctx.db.query("recordings").collect(),
      activations: await ctx.db.query("liveRoomActivations").collect(),
    })),
  ).toMatchObject({
    videos: [{ _id: id, state: "ready" }],
    attendance: [],
    reports: [],
    sessions: [],
    recordings: [],
    activations: [],
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("classSchedule", s.scheduleId)),
  ).toMatchObject({ status: "scheduled" });
});

test.each(["cancel", "expire"] as const)(
  "%s retires an unfinished upload without deleting the existing ready video",
  async (operation) => {
    const s = await setup();
    const previous = await s.ready();
    const pending = await s.reserve();
    if (operation === "cancel")
      await s.teacher.mutation(api.classSessionVideos.cancel, { id: pending });
    else {
      vi.setSystemTime(NOW + SESSION_VIDEO_UPLOAD_TTL_MS + 1);
      await s.t.mutation(internal.classSessionVideos.expire, { id: pending });
    }
    await s.t.mutation(internal.classSessionVideos.expire, { id: previous });
    expect(
      await s.t.run((ctx) => ctx.db.get("classSessionVideos", pending)),
    ).toMatchObject({ state: "retired" });
    expect(
      await s.t.run((ctx) => ctx.db.get("classSessionVideos", previous)),
    ).toMatchObject({ state: "ready" });
    expect(
      (await s.t.run((ctx) => ctx.db.get("classSchedule", s.scheduleId)))
        ?.prerecordedVideoId,
    ).toBe(previous);
  },
);

test("scheduled release is server-controlled and does not require a live class, attendance or report", async () => {
  const s = await setup();
  const id = await s.ready();
  const args = { scheduleId: s.scheduleId };
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, args),
  ).toBeNull();
  expect(
    await s.tutor.query(api.classSessionVideos.getForSchedule, args),
  ).toBeNull();
  const spoofed = await s.student.query(api.sessionRecords.get, {
    ...args,
    now: NOW + 10 * HOUR,
  });
  expect("recordings" in spoofed ? spoofed.recordings : []).toEqual([]);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, args),
  ).toBeNull();
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, args),
  ).toMatchObject({ id, released: true });
  expect(
    await s.student.query(api.sessionRecords.get, { ...args, now: NOW + HOUR }),
  ).toMatchObject({
    recordings: [{ prerecordedVideoId: id }],
    canCompleteReport: false,
  });
  expect(
    await s.t.run(async (ctx) => ({
      reports: await ctx.db.query("classSessionReports").collect(),
      attendance: await ctx.db.query("studentAttendanceRecords").collect(),
      recordings: await ctx.db.query("recordings").collect(),
    })),
  ).toEqual({ reports: [], attendance: [], recordings: [] });
});

test("a stale publication job cannot release a rescheduled occurrence", async () => {
  const s = await setup();
  const id = await s.ready();
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.scheduleId, {
      scheduledStart: NOW + 3 * HOUR,
      scheduledEnd: NOW + 4 * HOUR,
    });
    const schedule = await ctx.db.get("classSchedule", s.scheduleId);
    await syncPrerecordedRelease(ctx, schedule!);
  });
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).toBeNull();
  vi.setSystemTime(NOW + 3 * HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + 3 * HOUR,
  });
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).toMatchObject({ id, released: true });
});

test("moving an already released video into the future hides it until the new start", async () => {
  const s = await setup();
  const id = await s.ready();
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.scheduleId, {
      scheduledStart: NOW + 3 * HOUR,
      scheduledEnd: NOW + 4 * HOUR,
    });
    await syncPrerecordedRelease(
      ctx,
      (await ctx.db.get("classSchedule", s.scheduleId))!,
    );
  });
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).toBeNull();
});

test("revoked assignment between reserve and commit cannot publish or access the upload", async () => {
  const s = await setup();
  const previous = await s.ready();
  const id = await s.reserve();
  await s.t.run((ctx) =>
    ctx.db.patch(s.classId, { teacherId: s.users.unassigned }),
  );
  await expect(
    s.teacher.mutation(internal.classSessionVideos.commit, { id }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.query(internal.classSessionVideos.uploadContext, { id }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.classSessionVideos.cancel, { id });
  expect(
    (await s.t.run((ctx) => ctx.db.get("classSchedule", s.scheduleId)))
      ?.prerecordedVideoId,
  ).toBe(previous);
});

test.each(["cancelled", "abeka", "ignitia"] as const)(
  "%s occurrences reject upload without altering the academic session",
  async (state) => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(
        s.scheduleId,
        state === "cancelled"
          ? { status: "cancelled" }
          : { sessionType: state },
      ),
    );
    await expect(s.reserve()).rejects.toThrow("SESSION_VIDEO_UNAVAILABLE");
    expect(
      await s.t.run((ctx) => ctx.db.query("classSessionVideos").collect()),
    ).toEqual([]);
  },
);

test("removal cleans only the selected video and deletion retires other staged uploads", async () => {
  const s = await setup();
  const ready = await s.ready(),
    staged = await s.reserve();
  await s.teacher.mutation(api.classSessionVideos.remove, {
    scheduleId: s.scheduleId,
    expectedVideoId: ready,
  });
  expect(
    await s.t.query(internal.classSessionVideos.cleanupContext, { id: ready }),
  ).toMatchObject({ _id: ready, state: "retired" });
  await s.t.mutation(internal.classSessionVideos.finishCleanup, { id: staged });
  expect(
    await s.t.run((ctx) => ctx.db.get("classSessionVideos", staged)),
  ).not.toBeNull();
  await s.t.mutation(internal.classSessionVideos.finishCleanup, { id: ready });
  expect(
    await s.t.run((ctx) => ctx.db.get("classSessionVideos", ready)),
  ).toBeNull();
  await s.t.run((ctx) => ctx.db.delete(s.scheduleId));
  await s.t.mutation(internal.classSessionVideos.retireDeletedSchedule, {
    scheduleId: s.scheduleId,
  });
  expect(
    await s.t.query(internal.classSessionVideos.cleanupContext, { id: staged }),
  ).toMatchObject({ state: "retired" });
});

test("expired completion cannot replace the prior video, and early expiry is a no-op", async () => {
  const s = await setup();
  const previous = await s.ready();
  const id = await s.reserve();
  await s.t.mutation(internal.classSessionVideos.expire, { id });
  expect(
    await s.teacher.query(internal.classSessionVideos.uploadContext, { id }),
  ).toMatchObject({ state: "uploading" });
  vi.setSystemTime(NOW + SESSION_VIDEO_UPLOAD_TTL_MS);
  await expect(
    s.teacher.mutation(internal.classSessionVideos.commit, { id }),
  ).rejects.toThrow("SESSION_VIDEO_UPLOAD_EXPIRED");
  expect(
    (await s.t.run((ctx) => ctx.db.get("classSchedule", s.scheduleId)))
      ?.prerecordedVideoId,
  ).toBe(previous);
});

test("a late multipart allocation remains retired after cancellation, with its ID available for cleanup", async () => {
  const s = await setup();
  const previous = await s.ready();
  const id = await s.reserve();
  await s.teacher.mutation(api.classSessionVideos.cancel, { id });
  expect(
    await s.t.mutation(internal.classSessionVideos.attachUpload, {
      id,
      uploadId: "late-multipart",
    }),
  ).toBe(false);
  expect(
    await s.t.query(internal.classSessionVideos.cleanupContext, { id }),
  ).toMatchObject({ state: "retired", uploadId: "late-multipart" });
  expect(
    (await s.t.run((ctx) => ctx.db.get("classSchedule", s.scheduleId)))
      ?.prerecordedVideoId,
  ).toBe(previous);
});

test("publication does not expose the video outside the course or after enrollment is revoked", async () => {
  const s = await setup();
  const id = await s.ready();
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  for (const client of [s.unassigned, s.outsideAdmin])
    await expect(
      client.query(api.classSessionVideos.getForSchedule, {
        scheduleId: s.scheduleId,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.t.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).rejects.toThrow();
  expect(
    await s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).toMatchObject({ id, released: true });
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .first();
    if (enrollment) await ctx.db.delete(enrollment._id);
  });
  await expect(
    s.student.query(api.classSessionVideos.getForSchedule, {
      scheduleId: s.scheduleId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});
