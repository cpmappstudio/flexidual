import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadClassSessionVideo } from "@/lib/upload-class-session-video";
import { SESSION_VIDEO_PART_BYTES } from "@/lib/class-session-video";

class UploadRequest {
  static requests: UploadRequest[] = [];
  static respond: (request: UploadRequest) => void;
  url = "";
  body?: Blob;
  status = 200;
  upload = { onprogress: null as ((event: { loaded: number }) => void) | null };
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  onloadend?: () => void;
  open(_method: string, url: string) {
    this.url = url;
  }
  getResponseHeader() {
    return `etag-${this.url.split("/").at(-1)}`;
  }
  send(body: Blob) {
    this.body = body;
    UploadRequest.requests.push(this);
    queueMicrotask(() => UploadRequest.respond(this));
  }
  abort = vi.fn(() => {
    this.onabort?.();
    this.onloadend?.();
  });
  succeed() {
    this.upload.onprogress?.({ loaded: this.body!.size });
    this.onload?.();
    this.onloadend?.();
  }
  fail() {
    this.onerror?.();
    this.onloadend?.();
  }
}

const scheduleId = "schedule" as Id<"classSchedule">;
const file = (size = 30) =>
  new File([new Uint8Array(size)], "lesson.mp4", { type: "video/mp4" });
function setup() {
  const action = vi.fn(async (reference, args) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":begin"))
      return { id: "video", partSize: SESSION_VIDEO_PART_BYTES };
    if (name.endsWith(":signParts"))
      return args.partNumbers.map((partNumber: number) => ({
        partNumber,
        url: `https://private.test/${partNumber}`,
      }));
    return null;
  });
  const mutation = vi.fn().mockResolvedValue(null);
  const client = { action, mutation } as unknown as ConvexReactClient;
  return { client, action, mutation };
}
beforeEach(() => {
  UploadRequest.requests = [];
  UploadRequest.respond = (request) => request.succeed();
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
});
afterEach(() => vi.unstubAllGlobals());

test("uploads bounded slices directly, signs in batches and completes ordered parts", async () => {
  const s = setup();
  const onProgress = vi.fn();
  const video = file(2 * SESSION_VIDEO_PART_BYTES + 10);
  await expect(
    uploadClassSessionVideo(s.client, {
      scheduleId,
      file: video,
      durationMs: 60_000,
      onProgress,
    }),
  ).resolves.toBe("video");
  expect(UploadRequest.requests.map((request) => request.body?.size)).toEqual([
    SESSION_VIDEO_PART_BYTES,
    SESSION_VIDEO_PART_BYTES,
    10,
  ]);
  expect(
    s.action.mock.calls.map(([reference]) => getFunctionName(reference)),
  ).toEqual([
    "classSessionVideoStorage:begin",
    "classSessionVideoStorage:signParts",
    "classSessionVideoStorage:complete",
  ]);
  expect(s.action.mock.calls.at(-1)?.[1]).toEqual({
    id: "video",
    parts: [1, 2, 3].map((partNumber) => ({
      partNumber,
      etag: `etag-${partNumber}`,
    })),
  });
  expect(onProgress).toHaveBeenLastCalledWith({
    loaded: video.size,
    total: video.size,
  });
  expect(s.mutation).not.toHaveBeenCalled();
});

test("retries only the failed part, retaining other uploaded parts", async () => {
  const s = setup();
  let failed = false;
  UploadRequest.respond = (request) => {
    if (request.url.endsWith("/1") && !failed) {
      failed = true;
      request.fail();
    } else request.succeed();
  };
  await uploadClassSessionVideo(s.client, {
    scheduleId,
    file: file(SESSION_VIDEO_PART_BYTES + 10),
    durationMs: 60_000,
  });
  expect(
    UploadRequest.requests.map((request) => request.url.split("/").at(-1)),
  ).toEqual(["1", "2", "1"]);
  expect(
    s.action.mock.calls
      .filter(([reference]) =>
        getFunctionName(reference).endsWith(":signParts"),
      )
      .map(([, args]) => args.partNumbers),
  ).toEqual([[1, 2], [1]]);
});

test("terminal part failure aborts the parallel request and cancels staged storage", async () => {
  const s = setup();
  UploadRequest.respond = (request) => {
    if (request.url.endsWith("/1")) request.fail();
  };
  await expect(
    uploadClassSessionVideo(s.client, {
      scheduleId,
      file: file(2 * SESSION_VIDEO_PART_BYTES + 10),
      durationMs: 60_000,
    }),
  ).rejects.toThrow("network");
  expect(
    UploadRequest.requests.find((request) => request.url.endsWith("/2"))?.abort,
  ).toHaveBeenCalledOnce();
  expect(
    UploadRequest.requests.some((request) => request.url.endsWith("/3")),
  ).toBe(false);
  expect(s.mutation).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    id: "video",
  });
  expect(
    s.action.mock.calls.some(([reference]) =>
      getFunctionName(reference).endsWith(":complete"),
    ),
  ).toBe(false);
});

test("external cancellation during transfer aborts requests without completing", async () => {
  const s = setup();
  const controller = new AbortController();
  UploadRequest.respond = () => controller.abort();
  await expect(
    uploadClassSessionVideo(s.client, {
      scheduleId,
      file: file(SESSION_VIDEO_PART_BYTES + 10),
      durationMs: 60_000,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(s.mutation).toHaveBeenCalledOnce();
  expect(
    s.action.mock.calls.some(([reference]) =>
      getFunctionName(reference).endsWith(":complete"),
    ),
  ).toBe(false);
});

test("recovers a lost completion acknowledgement without reuploading the file", async () => {
  const s = setup();
  const action = s.action.getMockImplementation()!;
  let failed = false;
  s.action.mockImplementation(async (reference, args) => {
    if (getFunctionName(reference).endsWith(":complete") && !failed) {
      failed = true;
      throw new Error("Network");
    }
    return action(reference, args);
  });
  await uploadClassSessionVideo(s.client, {
    scheduleId,
    file: file(),
    durationMs: 60_000,
  });
  expect(UploadRequest.requests).toHaveLength(1);
  expect(
    s.action.mock.calls.filter(([reference]) =>
      getFunctionName(reference).endsWith(":complete"),
    ),
  ).toHaveLength(2);
  expect(s.mutation).not.toHaveBeenCalled();
});

test("does not retry permission denials or begin invalid files", async () => {
  const s = setup();
  const action = s.action.getMockImplementation()!;
  s.action.mockImplementation(async (reference, args) => {
    if (getFunctionName(reference).endsWith(":complete"))
      throw new ConvexError("PERMISSION_DENIED");
    return action(reference, args);
  });
  await expect(
    uploadClassSessionVideo(s.client, {
      scheduleId,
      file: file(),
      durationMs: 60_000,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    s.action.mock.calls.filter(([reference]) =>
      getFunctionName(reference).endsWith(":complete"),
    ),
  ).toHaveLength(1);
  s.action.mockClear();
  await expect(
    uploadClassSessionVideo(s.client, {
      scheduleId,
      file: new File(["text"], "bad.pdf"),
      durationMs: 60_000,
    }),
  ).rejects.toThrow("INVALID_SESSION_VIDEO");
  expect(s.action).not.toHaveBeenCalled();
});
