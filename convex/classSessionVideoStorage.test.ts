// @vitest-environment node
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  NOW,
  HOUR,
  setupClassSessionVideoTest as setup,
} from "./testHelpers/classSessionVideo.fixture";
import { SESSION_VIDEO_PART_BYTES } from "../lib/class-session-video";
import { getSessionContentSummary } from "./model/sessionContent";
import { retireScheduleVideos } from "./model/classSessionVideos";

const mocks = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn(), client: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    constructor(config: unknown) {
      mocks.client(config);
    }
    send = mocks.send;
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));
const metadata = {
  name: "lesson.mp4",
  size: 100,
  contentType: "video/mp4",
  durationMs: 60_000,
};
const parts = [{ partNumber: 1, etag: '"one"' }];
const mp4 = Buffer.alloc(32);
mp4.writeUInt32BE(24, 0);
mp4.write("ftypisom", 4);
mp4.write("isomiso2", 16);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PRERECORDED_S3_BUCKET", "private-prerecorded");
  vi.stubEnv("S3_BUCKET", "existing-live-recordings");
  vi.stubEnv("PRERECORDED_S3_ACCESS_KEY", "test-access");
  vi.stubEnv("PRERECORDED_S3_SECRET_KEY", "test-secret");
  vi.stubEnv("PRERECORDED_S3_ENDPOINT", "https://storage.test");
  vi.stubEnv("PRERECORDED_S3_REGION", "auto");
  mocks.client.mockClear();
  mocks.send.mockReset().mockImplementation(async (command: unknown) => {
    if (command instanceof CreateMultipartUploadCommand)
      return { UploadId: "provider-upload" };
    if (command instanceof HeadObjectCommand)
      return { ContentLength: 100, ContentType: "video/mp4" };
    if (command instanceof GetObjectCommand)
      return {
        ContentLength: mp4.length,
        Body: { transformToByteArray: async () => mp4 },
      };
    return {};
  });
  mocks.sign.mockReset().mockResolvedValue("https://private.test/signed");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("allocates private multipart storage with server-owned keys and no file bytes in Convex", async () => {
  const s = await setup();
  const { id, partSize } = await s.teacher.action(
    api.classSessionVideoStorage.begin,
    { scheduleId: s.scheduleId, ...metadata },
  );
  expect(partSize).toBe(SESSION_VIDEO_PART_BYTES);
  const command = mocks.send.mock.calls[0][0] as CreateMultipartUploadCommand;
  expect(command.input).toEqual({
    Bucket: "private-prerecorded",
    Key: `prerecorded/${id}.mp4`,
    ContentType: "video/mp4",
  });
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "uploading",
    uploadId: "provider-upload",
    uploadedBy: s.users.teacher,
  });
  expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).not.toHaveProperty(
    "prerecordedVideoId",
  );
});

test("refuses reuse of the existing public recording bucket before creating an upload", async () => {
  const s = await setup();
  vi.stubEnv("PRERECORDED_S3_BUCKET", "existing-live-recordings");
  await expect(
    s.teacher.action(api.classSessionVideoStorage.begin, {
      scheduleId: s.scheduleId,
      ...metadata,
    }),
  ).rejects.toThrow("SESSION_VIDEO_STORAGE_NOT_CONFIGURED");
  expect(mocks.send).not.toHaveBeenCalled();
  expect(
    await s.t.run((ctx) => ctx.db.query("classSessionVideos").collect()),
  ).toEqual([]);
});

test("keeps prerecording credentials independent from existing LiveKit recording storage", async () => {
  const s = await setup();
  vi.stubEnv("S3_ACCESS_KEY", "livekit-access");
  vi.stubEnv("S3_SECRET_KEY", "livekit-secret");
  vi.stubEnv("S3_ENDPOINT", "https://livekit-storage.test");
  vi.stubEnv("S3_REGION", "livekit-region");
  await s.teacher.action(api.classSessionVideoStorage.begin, {
    scheduleId: s.scheduleId,
    ...metadata,
  });
  expect(mocks.client).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: "https://storage.test",
      region: "auto",
      credentials: { accessKeyId: "test-access", secretAccessKey: "test-secret" },
    }),
  );
  expect(process.env.S3_ACCESS_KEY).toBe("livekit-access");
  expect(process.env.S3_SECRET_KEY).toBe("livekit-secret");
  expect(process.env.S3_ENDPOINT).toBe("https://livekit-storage.test");
  expect(process.env.S3_REGION).toBe("livekit-region");
});

test.each(["ACCESS_KEY", "SECRET_KEY", "ENDPOINT", "REGION"])(
  "refuses incomplete private %s configuration instead of using LiveKit credentials",
  async (field) => {
    const s = await setup();
    vi.stubEnv(`S3_${field}`, "existing-livekit-value");
    vi.stubEnv(`PRERECORDED_S3_${field}`, "");
    await expect(
      s.teacher.action(api.classSessionVideoStorage.begin, {
        scheduleId: s.scheduleId,
        ...metadata,
      }),
    ).rejects.toThrow("SESSION_VIDEO_STORAGE_NOT_CONFIGURED");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(
      await s.t.run((ctx) => ctx.db.query("classSessionVideos").collect()),
    ).toEqual([]);
  },
);

test("aborts provider allocation if persisting its multipart ID is no longer possible", async () => {
  const s = await setup();
  const old = await s.ready();
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command: unknown) => {
    if (command instanceof CreateMultipartUploadCommand) {
      await s.t.run(async (ctx) => {
        const id = ctx.db.normalizeId(
          "classSessionVideos",
          command.input.Key!.split("/")[1].replace(".mp4", ""),
        )!;
        await ctx.db.delete(id);
      });
    }
    return send(command);
  });
  await expect(
    s.teacher.action(api.classSessionVideoStorage.begin, {
      scheduleId: s.scheduleId,
      ...metadata,
    }),
  ).rejects.toThrow("SESSION_VIDEO_UPLOAD_EXPIRED");
  expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(
    AbortMultipartUploadCommand,
  );
  expect(await s.t.run((ctx) => ctx.db.get(old))).toMatchObject({
    state: "ready",
  });
});

test("signs bounded unique parts with exact byte lengths and rechecks revoked permissions", async () => {
  const s = await setup();
  const { id } = await s.teacher.action(api.classSessionVideoStorage.begin, {
    scheduleId: s.scheduleId,
    ...metadata,
    size: SESSION_VIDEO_PART_BYTES + 10,
  });
  await s.teacher.action(api.classSessionVideoStorage.signParts, {
    id,
    partNumbers: [1, 2],
  });
  expect(
    mocks.sign.mock.calls.map(
      ([, command]) => (command as UploadPartCommand).input.ContentLength,
    ),
  ).toEqual([SESSION_VIDEO_PART_BYTES, 10]);
  expect(mocks.sign.mock.calls[0][2]).toEqual({ expiresIn: 900 });
  for (const partNumbers of [[1, 1], [0], [3], [1.5], [], Array(9).fill(1)])
    await expect(
      s.teacher.action(api.classSessionVideoStorage.signParts, {
        id,
        partNumbers,
      }),
    ).rejects.toThrow("INVALID_SESSION_VIDEO_PART");
  await s.t.run((ctx) =>
    ctx.db.patch(s.classId, { teacherId: s.users.unassigned }),
  );
  await expect(
    s.teacher.action(api.classSessionVideoStorage.signParts, {
      id,
      partNumbers: [1],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("verifies the completed object and MP4 signature before publishing a replacement", async () => {
  const s = await setup();
  const old = await s.ready();
  const id = await s.reserve();
  await s.teacher.action(api.classSessionVideoStorage.complete, { id, parts });
  expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).toMatchObject({
    prerecordedVideoId: id,
    prerecordedVideoReleased: false,
  });
  expect(await s.t.run((ctx) => ctx.db.get(old))).toMatchObject({
    state: "retired",
  });
  expect(
    mocks.send.mock.calls.map(([command]) => command.constructor.name),
  ).toEqual([
    "CompleteMultipartUploadCommand",
    "HeadObjectCommand",
    "GetObjectCommand",
  ]);
  expect((mocks.send.mock.calls[2][0] as GetObjectCommand).input.Range).toBe(
    "bytes=0-4095",
  );
  mocks.send.mockClear();
  await s.teacher.action(api.classSessionVideoStorage.complete, { id, parts });
  expect(mocks.send).not.toHaveBeenCalled();
});

test.each(["size", "type", "signature", "unbounded-range"])(
  "rejects invalid %s without replacing the previous ready video",
  async (invalid) => {
    const s = await setup();
    const old = await s.ready();
    const id = await s.reserve();
    const send = mocks.send.getMockImplementation()!;
    mocks.send.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        return {
          ContentLength: invalid === "size" ? 99 : 100,
          ContentType: invalid === "type" ? "text/html" : "video/mp4",
        };
      if (command instanceof GetObjectCommand)
        return {
          ContentLength: invalid === "unbounded-range" ? 5000 : 32,
          Body: {
            transformToByteArray: async () =>
              invalid === "signature" ? Buffer.alloc(32) : mp4,
          },
        };
      return send(command);
    });
    await expect(
      s.teacher.action(api.classSessionVideoStorage.complete, { id, parts }),
    ).rejects.toThrow("INVALID_SESSION_VIDEO");
    expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).toMatchObject({
      prerecordedVideoId: old,
    });
    expect(await s.t.run((ctx) => ctx.db.get(id))).toBeNull();
    expect(await s.t.run((ctx) => ctx.db.get(old))).toMatchObject({
      state: "ready",
    });
  },
);

test("recovers an already completed multipart object after a lost provider response", async () => {
  const s = await setup();
  const id = await s.reserve();
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command: unknown) => {
    if (command instanceof CompleteMultipartUploadCommand)
      throw Object.assign(new Error("Already complete"), {
        name: "NoSuchUpload",
      });
    return send(command);
  });
  await s.teacher.action(api.classSessionVideoStorage.complete, { id, parts });
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "ready",
  });
});

test("network failures retain a retryable upload; permission revocation during S3 work prevents commit", async () => {
  const s = await setup();
  const old = await s.ready();
  const id = await s.reserve();
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockRejectedValueOnce(new Error("Network"));
  await expect(
    s.teacher.action(api.classSessionVideoStorage.complete, { id, parts }),
  ).rejects.toThrow("Network");
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "uploading",
  });
  mocks.send.mockImplementation(async (command: unknown) => {
    if (command instanceof HeadObjectCommand)
      await s.t.run((ctx) =>
        ctx.db.patch(s.classId, { teacherId: s.users.unassigned }),
      );
    return send(command);
  });
  await expect(
    s.teacher.action(api.classSessionVideoStorage.complete, { id, parts }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(await s.t.run((ctx) => ctx.db.get(s.scheduleId))).toMatchObject({
    prerecordedVideoId: old,
  });
  expect(await s.t.run((ctx) => ctx.db.get(id))).toBeNull();
});

test("signs only authorized playback and publishes at scheduled start without attendance writes", async () => {
  const s = await setup();
  const id = await s.ready();
  await expect(
    s.student.action(api.classSessionVideoStorage.playback, { id }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.teacher.action(api.classSessionVideoStorage.playback, { id }),
  ).resolves.toMatchObject({
    url: "https://private.test/signed",
    expiresAt: NOW + 2 * HOUR,
  });
  vi.setSystemTime(NOW + HOUR);
  await s.t.mutation(internal.classSessionVideos.publish, {
    id,
    scheduledStart: NOW + HOUR,
  });
  await expect(
    s.student.action(api.classSessionVideoStorage.playback, { id }),
  ).resolves.toMatchObject({ url: "https://private.test/signed" });
  expect(mocks.sign.mock.calls.at(-1)?.[2]).toEqual({ expiresIn: 7200 });
  expect(
    await s.t.run((ctx) => ctx.db.query("studentAttendanceRecords").collect()),
  ).toEqual([]);
  const summary = await s.t.run(async (ctx) =>
    getSessionContentSummary(ctx, (await ctx.db.get(s.scheduleId))!),
  );
  expect(summary.recordingCount).toBe(1);
});

test("cleanup aborts pending parts and deletes only retired videos, retaining metadata until success", async () => {
  const s = await setup();
  const old = await s.ready();
  const id = await s.reserve();
  await s.teacher.mutation(api.classSessionVideos.cancel, { id });
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementationOnce(async () => {
    throw new Error("Offline");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await s.t.action(internal.classSessionVideoStorage.cleanup, { id });
  expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
    state: "retired",
  });
  mocks.send.mockImplementation(send).mockClear();
  await s.t.action(internal.classSessionVideoStorage.cleanup, {
    id,
    attempt: 1,
  });
  expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(
    AbortMultipartUploadCommand,
  );
  expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(ListPartsCommand);
  expect(mocks.send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
  expect(await s.t.run((ctx) => ctx.db.get(id))).toBeNull();
  mocks.send.mockClear();
  await s.t.action(internal.classSessionVideoStorage.cleanup, { id: old });
  expect(mocks.send).not.toHaveBeenCalled();
  expect(await s.t.run((ctx) => ctx.db.get(old))).toMatchObject({
    state: "ready",
  });
  log.mockRestore();
});

test("failed cleanups from old uploads never hide later uploads during session deletion", async () => {
  const s = await setup();
  const ready = await s.ready();
  const pending = await s.reserve();
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 60; i++)
      await ctx.db.insert("classSessionVideos", {
        ...metadata,
        scheduleId: s.scheduleId,
        classId: s.classId,
        uploadedBy: s.users.teacher,
        bucket: "private-prerecorded",
        state: "retired",
        createdAt: NOW - 1,
      });
    await retireScheduleVideos(ctx, s.scheduleId);
    await ctx.db.delete(s.scheduleId);
  });
  expect(await s.t.run((ctx) => ctx.db.get(ready))).toMatchObject({
    state: "retired",
  });
  expect(await s.t.run((ctx) => ctx.db.get(pending))).toMatchObject({
    state: "retired",
  });
});

test("cleanup waits for in-flight multipart parts instead of discarding their cleanup reference", async () => {
  const s = await setup();
  const id = await s.reserve();
  await s.teacher.mutation(api.classSessionVideos.cancel, { id });
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command: unknown) => {
    if (command instanceof ListPartsCommand)
      return { Parts: [{ PartNumber: 1 }] };
    return send(command);
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await s.t.action(internal.classSessionVideoStorage.cleanup, { id });
    expect(await s.t.run((ctx) => ctx.db.get(id))).toMatchObject({
      state: "retired",
    });
    expect(
      mocks.send.mock.calls.some(
        ([command]) => command instanceof DeleteObjectCommand,
      ),
    ).toBe(false);
    mocks.send.mockImplementation(send);
    await s.t.action(internal.classSessionVideoStorage.cleanup, {
      id,
      attempt: 1,
    });
    expect(await s.t.run((ctx) => ctx.db.get(id))).toBeNull();
  } finally {
    log.mockRestore();
  }
});

test("the installed official signer binds upload URLs to their exact Content-Length", async () => {
  const { S3Client } =
    await vi.importActual<typeof import("@aws-sdk/client-s3")>(
      "@aws-sdk/client-s3",
    );
  const { getSignedUrl } = await vi.importActual<
    typeof import("@aws-sdk/s3-request-presigner")
  >("@aws-sdk/s3-request-presigner");
  const client = new S3Client({
    region: "auto",
    endpoint: "https://storage.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-access", secretAccessKey: "test-secret" },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const url = await getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: "private-prerecorded",
      Key: "prerecorded/video.mp4",
      UploadId: "upload",
      PartNumber: 1,
      ContentLength: 100,
    }),
    { expiresIn: 900 },
  );
  expect(
    new URL(url).searchParams.get("X-Amz-SignedHeaders")?.split(";"),
  ).toContain("content-length");
  client.destroy();
});
