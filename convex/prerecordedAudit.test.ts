// @vitest-environment node
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  NOW,
  HOUR,
  setupClassSessionVideoTest as setup,
} from "./testHelpers/classSessionVideo.fixture";
import {
  SESSION_VIDEO_CLEANUP_GRACE_MS,
  SESSION_VIDEO_UPLOAD_TTL_MS,
  sessionVideoObjectKey,
} from "../lib/class-session-video";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
const mp4 = Buffer.alloc(32);
mp4.writeUInt32BE(24, 0);
mp4.write("ftypisom", 4);
mp4.write("isomiso2", 16);
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    send = mocks.send;
  },
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PRERECORDED_S3_BUCKET", "private-prerecorded");
  vi.stubEnv("S3_BUCKET", "existing-live-recordings");
  vi.stubEnv("PRERECORDED_S3_ACCESS_KEY", "test-access");
  vi.stubEnv("PRERECORDED_S3_SECRET_KEY", "test-secret");
  vi.stubEnv("PRERECORDED_S3_ENDPOINT", "https://storage.test");
  vi.stubEnv("PRERECORDED_S3_REGION", "auto");
  mocks.send.mockReset();
});

test("historical attendance retains legacy replay without offering an inaccessible private upload", async () => {
  const s = await setup();
  const id = await s.ready();
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  const legacyId = await s.t.run(async (ctx) => {
    await ctx.db.insert("class_sessions", {
      scheduleId: s.scheduleId,
      studentId: s.users.student,
      joinedAt: NOW,
      leftAt: NOW + HOUR,
      durationSeconds: 3600,
      roomName: "prerecorded-occurrence",
      sessionDate: "2026-10-24",
    });
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .first();
    await ctx.db.delete(enrollment!._id);
    return await ctx.db.insert("recordings", {
      scheduleId: s.scheduleId,
      roomName: "prerecorded-occurrence",
      egressId: "historical-live-egress",
      status: "complete",
      url: "https://recordings.test/historical.mp4",
      startedAt: NOW,
      completedAt: NOW + HOUR,
    });
  });
  await expect(
    s.student.action(api.classSessionVideoStorage.playback, { id }),
  ).rejects.toThrow("PERMISSION_DENIED");
  const parts = await s.student.query(api.recordings.getPlayback, {
    scheduleId: s.scheduleId,
  });
  expect(parts).toEqual([
    expect.objectContaining({
      _id: legacyId,
      url: "https://recordings.test/historical.mp4",
    }),
  ]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test.each([false, true])(
  "late multipart completion after cancellation cleanup cannot orphan a storage object (delete retry=%s)",
  async (retryDelete) => {
    const s = await setup();
    const previous = await s.ready();
    const id = await s.reserve();
    const previousKey = sessionVideoObjectKey(previous);
    const key = sessionVideoObjectKey(id);
    const objects = new Set([previousKey]);
    const entered = deferred();
    const finishCompletion = deferred();
    let deleteFailed = false;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof CompleteMultipartUploadCommand) {
        entered.resolve();
        await finishCompletion.promise;
        objects.add(command.input.Key!);
        return {};
      }
      if (command instanceof AbortMultipartUploadCommand) return {};
      if (command instanceof ListPartsCommand) return { Parts: [] };
      if (command instanceof DeleteObjectCommand) {
        if (retryDelete && objects.has(key) && !deleteFailed) {
          deleteFailed = true;
          throw new Error("Storage temporarily offline");
        }
        objects.delete(command.input.Key!);
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        expect(objects.has(command.input.Key!)).toBe(true);
        return { ContentLength: 100, ContentType: "video/mp4" };
      }
      if (command instanceof GetObjectCommand)
        return {
          ContentLength: mp4.length,
          Body: { transformToByteArray: async () => mp4 },
        };
      throw new Error("Unexpected storage command");
    });

    const completion = s.teacher.action(api.classSessionVideoStorage.complete, {
      id,
      parts: [{ partNumber: 1, etag: '"one"' }],
    });
    await entered.promise;
    await s.teacher.mutation(api.classSessionVideos.cancel, { id });
    await s.t.action(internal.classSessionVideoStorage.cleanup, { id });
    expect(await s.t.run((ctx) => ctx.db.get(id))).toBeNull();
    finishCompletion.resolve();
    await expect(completion).rejects.toThrow("PERMISSION_DENIED");
    expect(
      (await s.t.run((ctx) => ctx.db.get(s.scheduleId)))?.prerecordedVideoId,
    ).toBe(previous);
    expect(objects.has(previousKey)).toBe(true);
    if (retryDelete) {
      expect(objects.has(key)).toBe(true);
      const retries = await s.t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      );
      expect(
        retries.some((job) =>
          job.args.some(
            (args) =>
              args.id === id &&
              args.bucket === "private-prerecorded" &&
              args.attempt === 1,
          ),
        ),
      ).toBe(true);
      await s.t.action(internal.classSessionVideoStorage.cleanup, {
        id,
        bucket: "private-prerecorded",
        attempt: 1,
      });
    }
    expect(objects.has(key)).toBe(false);
    log.mockRestore();
  },
);

test("the reservation expiry retains enough server-owned data to clean an orphan after a crashed action", async () => {
  const s = await setup();
  const id = await s.reserve();
  const jobs = await s.t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    jobs.some((job) =>
      job.args.some(
        (args) => args.id === id && args.bucket === "private-prerecorded",
      ),
    ),
  ).toBe(true);
  await s.t.run((ctx) => ctx.db.delete(id));
  vi.setSystemTime(NOW + SESSION_VIDEO_UPLOAD_TTL_MS);
  await s.t.mutation(internal.classSessionVideos.expire, {
    id,
    bucket: "private-prerecorded",
  });
  const cleanup = (
    await s.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    )
  ).find(
    (job) =>
      job.name.includes("classSessionVideoStorage:cleanup") &&
      job.args.some((args) => args.id === id),
  );
  expect(cleanup?.scheduledTime).toBe(
    Date.now() + SESSION_VIDEO_CLEANUP_GRACE_MS,
  );
  mocks.send.mockResolvedValue({});
  await s.t.action(internal.classSessionVideoStorage.cleanup, {
    id,
    bucket: "private-prerecorded",
  });
  expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
});

test("a failed concurrent completion never deletes the same video confirmed by its winner", async () => {
  const s = await setup();
  const id = await s.reserve();
  const firstGate = deferred(),
    secondGate = deferred(),
    bothEntered = deferred();
  let count = 0,
    objectExists = false;
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof CompleteMultipartUploadCommand) {
      const index = ++count;
      if (index === 2) bothEntered.resolve();
      await (index === 1 ? firstGate.promise : secondGate.promise);
      if (index === 2)
        throw Object.assign(new Error("Already finished"), {
          name: "NoSuchUpload",
        });
      objectExists = true;
      return {};
    }
    if (command instanceof HeadObjectCommand)
      return { ContentLength: 100, ContentType: "video/mp4" };
    if (command instanceof GetObjectCommand)
      return {
        ContentLength: mp4.length,
        Body: { transformToByteArray: async () => mp4 },
      };
    if (command instanceof DeleteObjectCommand) objectExists = false;
    return {};
  });
  const args = { id, parts: [{ partNumber: 1, etag: '"one"' }] };
  const first = s.teacher.action(api.classSessionVideoStorage.complete, args);
  const second = s.teacher.action(api.classSessionVideoStorage.complete, args);
  await bothEntered.promise;
  firstGate.resolve();
  await first;
  await s.t.run((ctx) =>
    ctx.db.patch(s.classId, { teacherId: s.users.unassigned }),
  );
  secondGate.resolve();
  await expect(second).rejects.toThrow("PERMISSION_DENIED");
  expect(objectExists).toBe(true);
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "ready",
  });
  expect(
    (await s.t.run((ctx) => ctx.db.get(s.scheduleId)))?.prerecordedVideoId,
  ).toBe(id);
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof DeleteObjectCommand,
    ),
  ).toBe(false);
});
