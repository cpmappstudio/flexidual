import { expect, test } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import {
  setupRecordingContext,
  storeWhiteboardImage,
} from "../tests/fixtures/whiteboard";
import { readVerifiedUploadBody } from "./model/fileUploadBody";

const png = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        ),
        (char) => char.charCodeAt(0),
      ),
    ],
    { type: "image/png" },
  );
const svg = () =>
  new Blob(
    [
      '<?xml version="1.0"?><!-- whiteboard --><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 0 L20 20"/></svg>',
    ],
    { type: "image/svg+xml" },
  );

async function setup() {
  const fixture = await setupRecordingContext();
  rateLimiter.register(fixture.t);
  const teacher = fixture.t.withIdentity({ subject: "recording-leader-one" });
  const other = fixture.t.withIdentity({ subject: "recording-leader-two" });
  function post(
    body = png(),
    client = teacher,
    overrides: Record<string, string> = {},
    size = body.size,
  ) {
    const params = new URLSearchParams({
      roomName: "recording-room",
      expectedLiveRoomName: "recording-room",
      fileId: "image-one",
      created: "1",
      ...overrides,
    });
    return client.fetch(`/whiteboard-files?${params}`, {
      method: "POST",
      body,
      headers: { "Content-Type": body.type, "X-File-Size": String(size) },
    });
  }
  return { ...fixture, teacher, other, post };
}

test("authenticated image body upload preserves scene data and is idempotent per file ID", async () => {
  const s = await setup();
  await s.teacher.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements: [{ id: "drawing", version: 1 }],
  });
  const response = await s.post();
  expect(response.status, await response.clone().text()).toBe(200);
  const ref = await response.json();
  expect(ref).toMatchObject({ mimeType: "image/png", created: 1 });
  expect(await (await s.post()).json()).toEqual(ref);
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(1);
  expect(
    await s.teacher.query(api.whiteboardSessions.getScene, {
      roomName: "recording-room",
    }),
  ).toMatchObject({
    elements: [{ id: "drawing", version: 1 }],
    fileRefs: { "image-one": ref },
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("whiteboardSessions").first()),
  ).toMatchObject({ recordingToken: "valid-recording-token" });
});

test.each(["constructor", "toString", "hasOwnProperty", "valueOf"])(
  "uploads and retries the own image reference %s without confusing inherited properties",
  async (fileId) => {
    const s = await setup();
    const normal = await (await s.post()).json();
    const response = await s.post(png(), s.teacher, { fileId });
    expect(response.status, await response.clone().text()).toBe(200);
    const ref = await response.json();
    expect(ref).toMatchObject({ mimeType: "image/png", created: 1 });
    expect(ref.storageId).not.toBe(normal.storageId);
    expect(await (await s.post(png(), s.teacher, { fileId })).json()).toEqual(
      ref,
    );
    const files = await s.teacher.query(api.whiteboardSessions.getSceneFiles, {
      roomName: "recording-room",
    });
    expect(Object.hasOwn(files.fileRefs, fileId)).toBe(true);
    expect(files.fileRefs[fileId]).toEqual(ref);
    expect(files.fileRefs["image-one"]).toEqual(normal);
    expect(
      await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(2);
    expect((await s.post(png(), s.other, { fileId })).status).toBe(400);
    expect((await s.post(png(), s.t, { fileId })).status).toBe(400);
  },
);

test("SVG images remain supported without changing other upload consumers", async () => {
  const s = await setup();
  const body = svg();
  const response = await s.post(body);
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toMatchObject({ mimeType: "image/svg+xml" });
  const request = () =>
    new Request("https://example.com/upload", { method: "POST", body });
  expect(
    await readVerifiedUploadBody(request(), body.size, body.size, body.type),
  ).toBeNull();
  expect(
    await readVerifiedUploadBody(request(), body.size, body.size, body.type, {
      allowSvg: true,
    }),
  ).not.toBeNull();
});

test.each([
  ["image/x-icon", new Uint8Array([0, 0, 1, 0, 1, 0, ...Array(40).fill(0)])],
  [
    "image/jfif",
    new Uint8Array([
      255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
      255, 217,
    ]),
  ],
  [
    "image/jpeg",
    new Uint8Array([
      255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
      255, 217,
    ]),
  ],
  ["image/gif", new TextEncoder().encode("GIF89a0000000000000000000000000000")],
  [
    "image/webp",
    new TextEncoder().encode("RIFF0000WEBPVP8 00000000000000000000"),
  ],
] as const)("preserves %s image upload support", async (mimeType, bytes) => {
  const s = await setup();
  // Signature fixtures exercise MIME verification; image decoding remains Excalidraw's job.
  const response = await s.post(new Blob([bytes], { type: mimeType }));
  expect(response.status, await response.clone().text()).toBe(200);
  expect(await response.json()).toMatchObject({ mimeType });
});

test("JFIF alias verification is opt-in and does not broaden chat or task upload validation", async () => {
  const bytes = new Uint8Array([
    255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    255, 217,
  ]);
  const body = new Blob([bytes], { type: "image/jfif" });
  const request = () =>
    new Request("https://example.com/upload", { method: "POST", body });
  expect(
    await readVerifiedUploadBody(request(), body.size, body.size, body.type),
  ).toBeNull();
  expect(
    await readVerifiedUploadBody(request(), body.size, body.size, body.type, {
      allowImageAliases: true,
    }),
  ).not.toBeNull();
});

test("outsiders, anonymous callers and stale live activations cannot store images", async () => {
  const s = await setup();
  for (const caller of [s.other, s.t]) {
    expect((await s.post(png(), caller)).status).toBe(400);
  }
  await s.t.run((ctx) =>
    ctx.db.patch(s.scheduleId, { liveRoomName: "reopened-room" }),
  );
  const stale = await s.post();
  expect(stale.status).toBe(400);
  expect(await stale.json()).toEqual({ error: "STALE_LIVE_ACTIVATION" });
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(0);
  expect(
    (await s.post(png(), s.teacher, { expectedLiveRoomName: "reopened-room" }))
      .status,
  ).toBe(200);
});

test("invalid, oversized and mismatched image bodies never become stored references", async () => {
  const s = await setup();
  for (const body of [
    new Blob(["not a png"], { type: "image/png" }),
    new Blob(["<html></html>"], { type: "image/svg+xml" }),
    new Blob(["<svg></svg><script>alert(1)</script>"], {
      type: "image/svg+xml",
    }),
  ])
    expect((await s.post(body)).status).toBe(400);
  expect((await s.post(png(), s.teacher, {}, png().size - 1)).status).toBe(400);
  expect(
    (await s.post(png(), s.teacher, {}, 10 * 1024 * 1024 + 1)).status,
  ).toBe(400);
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(0);
});

test("a known image ID from another board cannot be linked or deleted by the public mutation", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert("whiteboardSessions", {
      roomName: "another-room",
      elements: [],
      updatedAt: Date.now(),
    }),
  );
  const victim = await storeWhiteboardImage(
    s.t,
    "another-room",
    "victim",
    "victim-image",
  );
  await expect(
    s.teacher.mutation(api.whiteboardSessions.addFileRef, {
      roomName: "recording-room",
      expectedLiveRoomName: "recording-room",
      fileId: "stolen",
      storageId: victim.storageId,
      created: 1,
    }),
  ).rejects.toThrow("WHITEBOARD_UPLOAD_REQUIRES_AUTHENTICATED_BODY");
  expect(
    await s.t.run(async (ctx) =>
      (await ctx.storage.get(victim.storageId))?.text(),
    ),
  ).toBe("victim-image");
  const response = await s.post(png(), s.teacher, {
    storageId: victim.storageId,
  });
  expect((await response.json()).storageId).not.toBe(victim.storageId);
  expect(
    await s.t.run(async (ctx) =>
      (await ctx.storage.get(victim.storageId))?.text(),
    ),
  ).toBe("victim-image");
});

test("legacy upload URLs cannot create unowned blobs, even for an authorized teacher", async () => {
  const s = await setup();
  await expect(
    s.teacher.mutation(api.whiteboardFiles.generateUploadUrl, {
      roomName: "recording-room",
    }),
  ).rejects.toThrow("WHITEBOARD_UPLOAD_REQUIRES_AUTHENTICATED_BODY");
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(0);
});

test("an activation change while receiving the body compensates only the new blob", async () => {
  const s = await setup();
  const previous = await storeWhiteboardImage(
    s.t,
    "recording-room",
    "previous",
    "keep-image",
  );
  const body = png();
  const bytes = new Uint8Array(await body.arrayBuffer());
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        await s.t.run((ctx) =>
          ctx.db.patch(s.scheduleId, { liveRoomName: "reopened-room" }),
        );
        controller.enqueue(bytes);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body: stream,
    duplex: "half",
    headers: { "Content-Type": body.type, "X-File-Size": String(body.size) },
  };
  const response = await s.teacher.fetch(
    "/whiteboard-files?roomName=recording-room&expectedLiveRoomName=recording-room&fileId=late&created=1",
    init,
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "STALE_LIVE_ACTIVATION" });
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(1);
  expect(
    await s.t.run(async (ctx) =>
      (await ctx.storage.get(previous.storageId))?.text(),
    ),
  ).toBe("keep-image");
});

test("completion rechecks activation after body upload without deleting previous image refs", async () => {
  const s = await setup();
  const ref = await storeWhiteboardImage(
    s.t,
    "recording-room",
    "previous",
    "previous-image",
  );
  const body = png();
  const args = {
    roomName: "recording-room",
    expectedLiveRoomName: "recording-room",
    fileId: "late-image",
    created: 1,
    contentType: body.type,
    size: body.size,
  };
  await s.teacher.mutation(internal.whiteboardFiles.authorizeUpload, args);
  const stored = await s.t.run((ctx) => ctx.storage.store(body));
  await s.t.run((ctx) =>
    ctx.db.patch(s.scheduleId, { liveRoomName: "reopened-room" }),
  );
  await expect(
    s.teacher.mutation(internal.whiteboardFiles.complete, {
      ...args,
      storageId: stored,
    }),
  ).rejects.toThrow("STALE_LIVE_ACTIVATION");
  expect(
    await s.t.run(async (ctx) =>
      (await ctx.storage.get(ref.storageId))?.text(),
    ),
  ).toBe("previous-image");
});
