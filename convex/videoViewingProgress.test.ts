import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  setupClassSessionVideoTest,
  NOW,
  HOUR,
} from "./testHelpers/classSessionVideo.fixture";
import { addPlayedRange, coverageSize } from "../lib/video-progress";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());
const bits = (start: number, end: number) => {
  const coverage = new Uint8Array(coverageSize(60_000));
  addPlayedRange(coverage, start, end, 60_000);
  return coverage.buffer;
};
async function setup() {
  const s = await setupClassSessionVideoTest();
  const videoId = await s.ready();
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id: videoId,
    scheduledStart: NOW + HOUR,
  });
  const progress = await s.student.mutation(
    internal.videoViewingProgress.initialize,
    { videoId, durationMs: 60_000 },
  );
  return { ...s, videoId, progress };
}

test("only the enrolled learner can initialize after server release; staff preview and tutors never count", async () => {
  const s = await setupClassSessionVideoTest();
  const videoId = await s.ready();
  for (const client of [
    s.student,
    s.teacher,
    s.tutor,
    s.admin,
    s.unassigned,
    s.outsideAdmin,
  ]) {
    await expect(
      client.mutation(internal.videoViewingProgress.initialize, {
        videoId,
        durationMs: 60_000,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id: videoId,
    scheduledStart: NOW + HOUR,
  });
  await expect(
    s.teacher.mutation(internal.videoViewingProgress.initialize, {
      videoId,
      durationMs: 60_000,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const [a, b] = await Promise.all(
    [1, 2].map(() =>
      s.student.mutation(internal.videoViewingProgress.initialize, {
        videoId,
        durationMs: 60_000,
      }),
    ),
  );
  expect(a.id).toBe(b.id);
  expect(
    await s.t.run((ctx) => ctx.db.query("videoViewingProgress").collect()),
  ).toHaveLength(1);
});

test("concurrent checkpoints union overlapping ranges; retries and late snapshots never lose or double-count coverage", async () => {
  const s = await setup();
  await Promise.all([
    s.student.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(0, 20_000),
    }),
    s.student.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(10_000, 30_000),
    }),
  ]);
  const latest = await s.t.run((ctx) => ctx.db.get(s.progress.id));
  expect(latest?.watchedMs).toBe(30_000);
  vi.setSystemTime(NOW + 2 * HOUR);
  await s.student.mutation(api.videoViewingProgress.record, {
    id: s.progress.id,
    coverage: bits(0, 10_000),
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.progress.id))).toEqual(latest);
});

test.each(["inactive", "deleted", "anonymous"] as const)(
  "%s learners receive a terminal permission denial on every video read and progress entrypoint",
  async (state) => {
    const s = await setup();
    await s.student.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(0, 10_000),
    });
    const saved = await s.t.run((ctx) => ctx.db.get(s.progress.id));
    if (state === "inactive")
      await s.t.run((ctx) =>
        ctx.db.patch(s.users.student, { isActive: false }),
      );
    if (state === "deleted")
      await s.t.run((ctx) => ctx.db.delete(s.users.student));
    const client = state === "anonymous" ? s.t : s.student;
    const requests = [
      () =>
        client.query(internal.classSessionVideos.playbackContext, {
          id: s.videoId,
        }),
      () =>
        client.query(api.classSessionVideos.getForSchedule, {
          scheduleId: s.scheduleId,
        }),
      () =>
        client.mutation(internal.videoViewingProgress.context, {
          videoId: s.videoId,
        }),
      () =>
        client.mutation(internal.videoViewingProgress.initialize, {
          videoId: s.videoId,
          durationMs: 60_000,
        }),
      () =>
        client.mutation(internal.videoViewingProgress.markDurationUnavailable, {
          videoId: s.videoId,
        }),
      () =>
        client.mutation(api.videoViewingProgress.record, {
          id: s.progress.id,
          coverage: bits(10_000, 20_000),
        }),
    ];
    for (const request of requests)
      await expect(request()).rejects.toMatchObject({
        data: "PERMISSION_DENIED",
      });
    expect(await s.t.run((ctx) => ctx.db.get(s.progress.id))).toEqual(saved);
    if (state === "inactive") {
      await s.t.run((ctx) => ctx.db.patch(s.users.student, { isActive: true }));
      expect(
        await s.student.mutation(internal.videoViewingProgress.initialize, {
          videoId: s.videoId,
          durationMs: 60_000,
        }),
      ).toMatchObject({ id: s.progress.id });
      await expect(
        s.student.mutation(api.videoViewingProgress.record, {
          id: s.progress.id,
          coverage: bits(10_000, 20_000),
        }),
      ).resolves.toMatchObject({ watchedMs: 20_000 });
    }
  },
);

test("rejects malformed/oversized coverage and prevents writing another learner's progress after an identity change", async () => {
  const s = await setup();
  for (const coverage of [
    new ArrayBuffer(8192),
    new Uint8Array([255]).buffer,
    new Uint8Array(8).fill(255).buffer,
  ]) {
    await expect(
      s.student.mutation(api.videoViewingProgress.record, {
        id: s.progress.id,
        coverage,
      }),
    ).rejects.toThrow("INVALID_VIDEO_COVERAGE");
  }
  await s.t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId: s.classId,
      studentId: s.users.unassigned,
      enrolledAt: NOW,
      enrolledBy: s.users.admin,
    }),
  );
  await expect(
    s.unassigned.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(0, 10_000),
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("rechecks revoked enrollment, cancellation and release on each checkpoint without changing attendance or teaching records", async () => {
  const s = await setup();
  await s.student.mutation(api.videoViewingProgress.record, {
    id: s.progress.id,
    coverage: bits(0, 10_000),
  });
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) => q.eq("classId", s.classId))
      .unique();
    await ctx.db.delete(enrollment!._id);
  });
  await expect(
    s.student.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(10_000, 20_000),
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await s.t.run((ctx) => ctx.db.query("studentAttendanceRecords").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("classSessionReports").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) =>
      ctx.db.query("classPrerecordedLessonRecords").collect(),
    ),
  ).toEqual([]);
});

test("a replacement starts separate progress; retiring the old asset cleans coverage without touching its replacement", async () => {
  const s = await setup();
  await s.student.mutation(api.videoViewingProgress.record, {
    id: s.progress.id,
    coverage: bits(0, 60_000),
  });
  const replacement = await s.ready();
  const next = await s.student.mutation(
    internal.videoViewingProgress.initialize,
    { videoId: replacement, durationMs: 60_000 },
  );
  expect(next.id).not.toBe(s.progress.id);
  expect(new Uint8Array(next.coverage).some(Boolean)).toBe(false);
  await expect(
    s.student.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(0, 60_000),
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.t.mutation(internal.videoViewingProgress.cleanup, {
    videoId: s.videoId,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.progress.id))).toBeNull();
  expect(await s.t.run((ctx) => ctx.db.get(next.id))).not.toBeNull();
});

test("existing limiter bounds concurrent bursts and permits an idempotent retry after refill", async () => {
  const s = await setup();
  const attempts = await Promise.allSettled(
    Array.from({ length: 26 }, () =>
      s.student.mutation(api.videoViewingProgress.record, {
        id: s.progress.id,
        coverage: bits(0, 10_000),
      }),
    ),
  );
  expect(
    attempts.filter((result) => result.status === "rejected"),
  ).toHaveLength(2);
  vi.setSystemTime(NOW + HOUR + 60_000);
  await expect(
    s.student.mutation(api.videoViewingProgress.record, {
      id: s.progress.id,
      coverage: bits(0, 10_000),
    }),
  ).resolves.toMatchObject({ watchedMs: 10_000 });
});
