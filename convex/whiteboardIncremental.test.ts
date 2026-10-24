import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  setupRecordingContext,
  storeWhiteboardImage,
} from "../tests/fixtures/whiteboard";
import {
  MAX_WHITEBOARD_BUCKET_BYTES,
  sortWhiteboardElements,
  splitWhiteboardPayload,
  joinWhiteboardPayload,
  MAX_WHITEBOARD_PART_BYTES,
  MAX_WHITEBOARD_PARTS,
  whiteboardBucketId,
  type WhiteboardElement,
} from "../lib/whiteboard-elements";
import { deleteWhiteboardManifest } from "./model/whiteboardSceneStorage";
import {
  MAX_WHITEBOARD_RECENT_BYTES,
  MAX_WHITEBOARD_RECENT_UPDATES,
  type WhiteboardBucketCursor,
  applyWhiteboardBucketResult,
} from "../lib/whiteboard-bucket-updates";

const ROOM = "recording-room";
const encode = (elements: readonly WhiteboardElement[]) =>
  splitWhiteboardPayload(JSON.stringify(elements));
const element = (
  id: string,
  version = 1,
  extra: Record<string, unknown> = {},
): WhiteboardElement => ({
  id,
  version,
  versionNonce: 10,
  isDeleted: false,
  index: "a0",
  ...extra,
});

async function setup() {
  const f = await setupRecordingContext();
  const writer = f.t.withIdentity({ subject: "recording-leader-one" });
  const ensure = () =>
    writer.mutation(api.whiteboardSessions.ensureScene, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
    });
  const delta = async (
    elements: WhiteboardElement[],
    expectedLiveRoomName = ROOM,
    generation = 0,
  ) =>
    writer.mutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName,
      generation,
      bucketId: whiteboardBucketId(elements[0].id),
      parts: encode(elements),
    });
  const bucket = (id: string) =>
    writer.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId(id),
    });
  return { ...f, writer, ensure, delta, bucket };
}

test("initialization distinguishes a fresh cloud scene from an existing empty legacy scene", async () => {
  const existing = await setup();
  expect(
    await existing.writer.query(api.whiteboardSessions.getSceneManifest, {
      roomName: ROOM,
    }),
  ).toMatchObject({ format: 1, fromLegacy: true });
  expect(await existing.ensure()).toMatchObject({
    format: 2,
    fromLegacy: true,
  });

  const fresh = await setup();
  await fresh.t.run(async (ctx) => {
    const legacy = await ctx.db.query("whiteboardSessions").first();
    await ctx.db.delete("whiteboardSessions", legacy!._id);
  });
  expect(
    await fresh.writer.query(api.whiteboardSessions.getSceneManifest, {
      roomName: ROOM,
    }),
  ).toBeNull();
  expect(await fresh.ensure()).toMatchObject({ format: 2, fromLegacy: false });
  // ensureScene now creates the compatibility row, but must retain the original
  // distinction on every later hydration/ensure so unknown local drafts survive.
  expect(await fresh.ensure()).toMatchObject({ fromLegacy: false });
  expect(
    await fresh.writer.query(api.whiteboardSessions.getSceneManifest, {
      roomName: ROOM,
    }),
  ).toMatchObject({ format: 2, fromLegacy: false });
});

test("incremental initialization preserves legacy drawings, order, bindings, images and recording access", async () => {
  const f = await setup();
  const elements = [
    element("text", 3, { index: null, containerId: "box" }),
    element("box", 2, {
      index: null,
      boundElements: [{ id: "text", type: "text" }],
    }),
  ];
  await f.writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: ROOM,
    elements,
  });
  const image = await storeWhiteboardImage(
    f.t,
    ROOM,
    "image",
    "keep-original-bytes",
  );
  expect(await f.ensure()).toMatchObject({
    format: 2,
    generation: 0,
    legacyOrder: ["text", "box"],
  });
  expect(
    await f.writer.query(api.whiteboardSessions.getScene, { roomName: ROOM }),
  ).toMatchObject({ elements, fileRefs: { image } });
  expect(
    await f.writer.query(api.whiteboardSessions.getSceneFiles, {
      roomName: ROOM,
    }),
  ).toEqual({ fileRefs: { image } });
  const stored = await f.t.run((ctx) =>
    ctx.db.query("whiteboardSessions").first(),
  );
  expect(stored?.elements).toEqual(elements);
  expect(
    await f.t.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId("box"),
      recordingToken: "valid-recording-token",
    }),
  ).not.toBeNull();
  expect(
    await f.t.run(async (ctx) =>
      (await ctx.storage.get(image.storageId))?.text(),
    ),
  ).toBe("keep-original-bytes");
  await f.writer.run(async (ctx) => {
    await ctx.runMutation(api.whiteboardSessions.ensureScene, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
    });
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      0,
    );
  });
});

test("a partial edit rewrites only its bucket and repeated/stale versions cause no writes", async () => {
  const f = await setup();
  await f.ensure();
  const first = element("one");
  const second = element("two");
  expect(whiteboardBucketId(first.id)).not.toBe(whiteboardBucketId(second.id));
  await f.delta([first]);
  await f.delta([second]);
  const untouched = await f.bucket(second.id);
  const manifest = await f.writer.query(
    api.whiteboardSessions.getSceneManifest,
    { roomName: ROOM },
  );
  await f.writer.run(async (ctx) => {
    await ctx.runMutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: whiteboardBucketId(first.id),
      parts: encode([element(first.id, 2)]),
    });
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      3, // canonical fragment + recent history + course-page preview signature
    );
  });
  expect(await f.bucket(second.id)).toEqual(untouched);
  expect(
    await f.writer.query(api.whiteboardSessions.getSceneManifest, {
      roomName: ROOM,
    }),
  ).toEqual(manifest);
  await f.writer.run(async (ctx) => {
    await ctx.runMutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: whiteboardBucketId(first.id),
      parts: encode([element(first.id, 1)]),
    });
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      0,
    );
  });
  expect(await f.delta([element(first.id, 2)])).toEqual({
    changed: false,
    generation: 0,
    conflictsParts: [],
  });
});

test("acknowledgments return only rejected IDs; exact nonce ties accept remote order and remain idempotent", async () => {
  const f = await setup();
  await f.ensure();
  const saved = element("ack-conflict", 4, {
    versionNonce: 3,
    x: 40,
    index: "a1",
  });
  const unrelatedId = Array.from(
    { length: 1000 },
    (_, i) => `ack-neighbor-${i}`,
  ).find((id) => whiteboardBucketId(id) === whiteboardBucketId(saved.id))!;
  await f.delta([saved, element(unrelatedId)]);
  const stale = await f.delta([
    element(saved.id, 3, { versionNonce: 3, x: 30 }),
  ]);
  expect(stale.changed).toBe(false);
  expect(JSON.parse(joinWhiteboardPayload(stale.conflictsParts))).toEqual([
    saved,
  ]);
  const tiedVersion = await f.delta([
    element(saved.id, 4, { versionNonce: 8, x: 80 }),
  ]);
  expect(tiedVersion.changed).toBe(false);
  expect(JSON.parse(joinWhiteboardPayload(tiedVersion.conflictsParts))).toEqual(
    [saved],
  );
  const reordered = { ...saved, index: "a2" };
  const tiedNonce = await f.delta([reordered]);
  expect(tiedNonce).toEqual({
    changed: true,
    generation: 0,
    conflictsParts: [],
  });
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket(saved.id))!.parts)).find(
      (item: WhiteboardElement) => item.id === saved.id,
    ),
  ).toEqual(reordered);
  expect(await f.delta([reordered])).toEqual({
    changed: false,
    generation: 0,
    conflictsParts: [],
  });
  const accepted = await f.delta([
    element(saved.id, 5, { versionNonce: 99, x: 50 }),
  ]);
  expect(accepted).toEqual({
    changed: true,
    generation: 0,
    conflictsParts: [],
  });
});

test("staff edits merge by version and lower nonce, preserving other elements and tombstone/undo", async () => {
  const f = await setup();
  await f.t.run((ctx) =>
    ctx.db.patch(f.classId, { tutorId: f.secondLeaderId }),
  );
  const tutor = f.t.withIdentity({ subject: "recording-leader-two" });
  await f.ensure();
  await f.delta([element("draw", 2, { versionNonce: 5, x: 5 })]);
  await tutor.mutation(api.whiteboardSessions.applySceneDelta, {
    roomName: ROOM,
    expectedLiveRoomName: ROOM,
    generation: 0,
    bucketId: whiteboardBucketId("draw"),
    parts: encode([element("draw", 2, { versionNonce: 3, x: 30 })]),
  });
  await f.delta([element("draw", 2, { versionNonce: 8, x: 80 })]);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket("draw"))!.parts))[0],
  ).toMatchObject({
    x: 30,
    versionNonce: 3,
  });
  await f.delta([element("draw", 3, { isDeleted: true })]);
  await f.delta([element("draw", 2)]);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket("draw"))!.parts))[0]
      .isDeleted,
  ).toBe(true);
  await f.delta([element("draw", 4, { isDeleted: false })]);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket("draw"))!.parts))[0]
      .isDeleted,
  ).toBe(false);
});

test("anonymous and other-course callers cannot hydrate, initialize or mutate incremental content", async () => {
  const f = await setup();
  await f.ensure();
  await f.delta([element("private")]);
  for (const caller of [
    f.t,
    f.t.withIdentity({ subject: "recording-leader-two" }),
  ]) {
    for (const query of [
      api.whiteboardSessions.getSceneManifest,
      api.whiteboardSessions.getSceneFiles,
    ])
      await expect(caller.query(query, { roomName: ROOM })).rejects.toThrow(
        "PERMISSION_DENIED",
      );
    await expect(
      caller.query(api.whiteboardSessions.getSceneBucket, {
        roomName: ROOM,
        bucketId: whiteboardBucketId("private"),
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      caller.mutation(api.whiteboardSessions.ensureScene, {
        roomName: ROOM,
        expectedLiveRoomName: ROOM,
      }),
    ).rejects.toThrow();
    await expect(
      caller.mutation(api.whiteboardSessions.applySceneDelta, {
        roomName: ROOM,
        expectedLiveRoomName: ROOM,
        generation: 0,
        bucketId: whiteboardBucketId("private"),
        parts: encode([element("private", 99)]),
      }),
    ).rejects.toThrow();
  }
  await f.t.run((ctx) =>
    ctx.db.patch(f.classId, { students: [f.secondLeaderId] }),
  );
  const student = f.t.withIdentity({ subject: "recording-leader-two" });
  expect(
    await student.query(api.whiteboardSessions.getSceneManifest, {
      roomName: ROOM,
    }),
  ).toMatchObject({ format: 2 });
  await expect(
    student.mutation(api.whiteboardSessions.ensureScene, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId("private"),
      recordingToken: "wrong",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("reopening retains buckets but rejects old activation and stale generation; closed reads are denied", async () => {
  const f = await setup();
  await f.ensure();
  await f.delta([element("keep")]);
  const saved = await f.bucket("keep");
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, { isLive: false, status: "completed" }),
  );
  await expect(f.bucket("keep")).rejects.toThrow("PERMISSION_DENIED");
  await f.t.run((ctx) =>
    ctx.db.patch(f.scheduleId, {
      sessionStartedAt: Date.now() - 1000,
      sessionReopenUntil: Date.now() + 60_000,
    }),
  );
  await f.writer.mutation(api.schedule.reopenLiveSession, { roomName: ROOM });
  const reopened = await f.t.run((ctx) => ctx.db.get(f.scheduleId));
  const physicalRoom = reopened!.liveRoomName!;
  expect(physicalRoom).not.toBe(ROOM);
  await expect(f.delta([element("keep", 2)])).rejects.toThrow(
    "STALE_LIVE_ACTIVATION",
  );
  await expect(f.delta([element("keep", 2)], physicalRoom, 99)).rejects.toThrow(
    "STALE_WHITEBOARD_GENERATION",
  );
  expect(await f.bucket("keep")).toEqual(saved);
  await f.delta([element("keep", 2)], physicalRoom);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket("keep"))!.parts))[0]
      .version,
  ).toBe(2);
});

test("legacy reader dependency changes for each v2 edit, even within one clock tick", async () => {
  const f = await setup();
  await f.ensure();
  await f.delta([element("one")]);
  const first = await f.writer.query(api.whiteboardSessions.getScene, {
    roomName: ROOM,
  });
  await f.delta([element("two")]);
  const second = await f.writer.query(api.whiteboardSessions.getScene, {
    roomName: ROOM,
  });
  expect(second!.updatedAt).toBeGreaterThan(first!.updatedAt);
  await f.delta([element("one", 2)]);
  const third = await f.writer.query(api.whiteboardSessions.getScene, {
    roomName: ROOM,
  });
  expect(third!.updatedAt).toBeGreaterThan(second!.updatedAt);
});

test("mixed legacy indices have a stable total order; valid indices preserve reordering", () => {
  const a = element("a", 1, { index: "a2" });
  const b = element("b", 1, { index: null });
  const c = element("c", 1, { index: "a0" });
  const order = ["a", "b", "c"];
  for (const permutation of [
    [a, b, c],
    [c, b, a],
    [b, c, a],
  ])
    expect(
      sortWhiteboardElements(permutation, order).map((item) => item.id),
    ).toEqual(order);
  expect(
    sortWhiteboardElements([a, { ...b, index: "a1" }, c], order).map(
      (item) => item.id,
    ),
  ).toEqual(["c", "b", "a"]);
});

test("recording token rotations update bucket access and old tokens are revoked", async () => {
  const f = await setup();
  await f.ensure();
  await f.delta([element("recorded")]);
  await f.t.mutation(internal.whiteboardSessions.setRecordingToken, {
    roomName: ROOM,
    recordingToken: "new-token",
    expectedToken: "valid-recording-token",
  });
  await expect(
    f.t.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId("recorded"),
      recordingToken: "valid-recording-token",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await f.t.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId("recorded"),
      recordingToken: "new-token",
    }),
  ).not.toBeNull();
});

test("JSON buckets preserve strokes with more than 8192 points; legacy client fails explicitly", async () => {
  const f = await setup();
  await f.ensure();
  const stroke = element("long-stroke", 1, {
    type: "freedraw",
    points: Array.from({ length: 9000 }, () => [1, 2]),
    pressures: Array(9000).fill(0.5),
  });
  await f.delta([stroke]);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket(stroke.id))!.parts))[0],
  ).toEqual(stroke);
  await expect(
    f.writer.query(api.whiteboardSessions.getScene, { roomName: ROOM }),
  ).rejects.toThrow("WHITEBOARD_SCENE_REQUIRES_INCREMENTAL_CLIENT");
  await expect(
    f.writer.mutation(api.whiteboardSessions.upsertScene, {
      roomName: ROOM,
      elements: [],
    }),
  ).rejects.toThrow("WHITEBOARD_SCENE_UPGRADE_REQUIRED");
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket(stroke.id))!.parts))[0],
  ).toEqual(stroke);
});

test("dense legacy freehand data within native array limits remains recoverable during initialization", async () => {
  const f = await setup();
  const stroke = element("dense-legacy-stroke", 1, {
    type: "freedraw",
    points: Array.from({ length: 8192 }, (_, i) => [
      123.12345678901234 + (i / 8193) * Math.PI,
      456.98765432109876 + (i / 8193) * Math.E,
    ]),
    pressures: Array.from({ length: 8192 }, (_, i) => (i % 8191) / 8191),
  });
  const bytes = new TextEncoder().encode(JSON.stringify([stroke])).byteLength;
  expect(bytes).toBe(479176);
  expect(bytes).toBeLessThan(1024 * 1024);
  await f.writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: ROOM,
    elements: [stroke],
  });
  // The existing public path successfully stores this legitimate scene. The
  // replacement transport must never make that scene impossible to hydrate.
  await expect(f.ensure()).resolves.toMatchObject({
    format: 2,
    fromLegacy: true,
  });
  const restored = JSON.parse(
    joinWhiteboardPayload((await f.bucket(stroke.id))!.parts),
  );
  expect(restored).toEqual([stroke]);
  const extended = {
    ...stroke,
    version: 2,
    points: [...(stroke.points as number[][]), [5.5, 6.6]],
  };
  await f.delta([extended]);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket(stroke.id))!.parts)),
  ).toEqual([extended]);
});

test("Unicode payloads and conflict acknowledgments larger than 1MiB round-trip bounded fragments", async () => {
  const f = await setup();
  await f.ensure();
  const text =
    "a".repeat(MAX_WHITEBOARD_PART_BYTES - 32) + "😀漢字".repeat(110_000);
  const saved = element("unicode-parts", 3, { text });
  const parts = encode([saved]);
  expect(
    new TextEncoder().encode(JSON.stringify([saved])).byteLength,
  ).toBeGreaterThan(1024 * 1024);
  expect(parts.length).toBeGreaterThan(1);
  for (const part of parts) {
    expect(new TextEncoder().encode(part).byteLength).toBeLessThanOrEqual(
      MAX_WHITEBOARD_PART_BYTES,
    );
    expect(
      new TextDecoder("utf-8", { fatal: true }).decode(
        new TextEncoder().encode(part),
      ),
    ).toBe(part);
  }
  expect(joinWhiteboardPayload(parts)).toBe(JSON.stringify([saved]));
  await f.delta([saved]);
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket(saved.id))!.parts)),
  ).toEqual([saved]);
  const result = await f.delta([element(saved.id, 1)]);
  expect(result.conflictsParts.length).toBeGreaterThan(1);
  expect(JSON.parse(joinWhiteboardPayload(result.conflictsParts))).toEqual([
    saved,
  ]);
  await expect(
    f.writer.mutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: whiteboardBucketId(saved.id),
      parts: Array(MAX_WHITEBOARD_PARTS + 1).fill(""),
    }),
  ).rejects.toThrow("WHITEBOARD_BUCKET_TOO_LARGE");
  await expect(
    f.writer.mutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: whiteboardBucketId(saved.id),
      parts: ["a".repeat(MAX_WHITEBOARD_PART_BYTES + 1)],
    }),
  ).rejects.toThrow("WHITEBOARD_BUCKET_TOO_LARGE");
});

test("large bucket updates write only changed fragments and shrinking removes obsolete fragments", async () => {
  const f = await setup();
  await f.ensure();
  const saved = element("fragment-writes", 1, { text: "a".repeat(300_000) });
  await f.delta([saved]);
  const changed = element(saved.id, 2, { text: "a".repeat(299_999) + "b" });
  await f.writer.run(async (ctx) => {
    await ctx.runMutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: whiteboardBucketId(saved.id),
      parts: encode([changed]),
    });
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      4, // changed canonical fragments + recent history + course-page preview signature
    );
  });
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket(saved.id))!.parts)),
  ).toEqual([changed]);
  await f.delta([element(saved.id, 3, { text: "small" })]);
  expect((await f.bucket(saved.id))!.parts).toHaveLength(1);
});

test("invalid deltas and UTF-8/merged bucket limits reject atomically without losing drawings", async () => {
  const f = await setup();
  await f.ensure();
  const original = element("heavy", 1, { text: "a".repeat(4_500_000) });
  await f.delta([original]);
  const before = await f.bucket(original.id);
  await expect(
    f.delta([element(original.id, 2, { text: "😀".repeat(2_200_000) })]),
  ).rejects.toThrow("WHITEBOARD_BUCKET_TOO_LARGE");
  const collidingId = Array.from(
    { length: 1000 },
    (_, i) => `collision-${i}`,
  ).find((id) => whiteboardBucketId(id) === whiteboardBucketId(original.id))!;
  const incoming = element(collidingId, 1, { text: "b".repeat(4_500_000) });
  expect(JSON.stringify(incoming).length).toBeLessThan(
    MAX_WHITEBOARD_BUCKET_BYTES,
  );
  await expect(f.delta([incoming])).rejects.toThrow(
    "WHITEBOARD_BUCKET_TOO_LARGE",
  );
  expect(await f.bucket(original.id)).toEqual(before);
  await expect(
    f.writer.mutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: (whiteboardBucketId(original.id) + 1) % 64,
      parts: encode([original]),
    }),
  ).rejects.toThrow("INVALID_WHITEBOARD_BUCKET");
  await expect(
    f.writer.mutation(api.whiteboardSessions.applySceneDelta, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      generation: 0,
      bucketId: 0,
      parts: ['[{"id":"bad"}]'],
    }),
  ).rejects.toThrow("INVALID_WHITEBOARD_ELEMENTS");
});

test("detaching a manifest cleans bounded batches and old cleanup cannot erase a new scene", async () => {
  const f = await setup();
  await f.ensure();
  const ids = new Map<number, string>();
  for (let i = 0; ids.size < 10; i += 1)
    ids.set(whiteboardBucketId(`batch-${i}`), `batch-${i}`);
  for (const id of ids.values()) await f.delta([element(id)]);
  const oldManifest = await f.t.run((ctx) =>
    ctx.db.query("whiteboardSceneManifests").first(),
  );
  // This test exercises disposable scenes; adopted course pages have separate retention.
  await f.t.run((ctx) =>
    ctx.db.patch("whiteboardSceneManifests", oldManifest!._id, {
      pageId: undefined,
    }),
  );
  await f.t.run((ctx) => deleteWhiteboardManifest(ctx, ROOM));
  await f.t.mutation(internal.whiteboardSessions.cleanupSceneBuckets, {
    manifestId: oldManifest!._id,
  });
  const remaining = await f.t.run((ctx) =>
    ctx.db
      .query("whiteboardSceneBuckets")
      .withIndex("by_manifestId_and_bucketId_and_partIndex", (q) =>
        q.eq("manifestId", oldManifest!._id),
      )
      .take(64),
  );
  expect(remaining.length).toBe(2);
  await f.ensure();
  await f.delta([element("new-scene")]);
  await f.t.mutation(internal.whiteboardSessions.cleanupSceneBuckets, {
    manifestId: oldManifest!._id,
  });
  expect(
    JSON.parse(joinWhiteboardPayload((await f.bucket("new-scene"))!.parts))[0]
      .id,
  ).toBe("new-scene");
  const histories = await f.t.run((ctx) =>
    ctx.db.query("whiteboardSceneUpdates").take(64),
  );
  expect(
    histories.some((history) => history.manifestId === oldManifest!._id),
  ).toBe(false);
  expect(histories).toHaveLength(1);
});

test("revision reads skip historical bytes, recover missed concurrent edits and tombstones, and recheck access", async () => {
  const f = await setup();
  await f.ensure();
  const old = element("historic", 1, { content: "x".repeat(250000) });
  const ids = Array.from({ length: 10000 }, (_, i) => `recent-${i}`)
    .filter((id) => whiteboardBucketId(id) === whiteboardBucketId(old.id))
    .slice(0, 2);
  await f.delta([old]);
  const original = (await f.bucket(old.id))!;
  const cursor: WhiteboardBucketCursor = {
    sourceId: original.sourceId!,
    generation: original.generation,
    revision: original.revision!,
  };
  await Promise.all(ids.map((id) => f.delta([element(id)])));
  await f.delta([element(ids[0], 2, { isDeleted: true })]);
  const args = { roomName: ROOM, bucketId: whiteboardBucketId(old.id), cursor };
  const changes = (await f.writer.query(
    api.whiteboardSessions.getSceneBucket,
    args,
  ))!;
  expect(changes.baseRevision).toBe(cursor.revision);
  const recent = JSON.parse(joinWhiteboardPayload(changes.parts));
  expect(recent.map((item: WhiteboardElement) => item.id).sort()).toEqual(
    [...ids].sort(),
  );
  expect(
    recent.find((item: WhiteboardElement) => item.id === ids[0]).isDeleted,
  ).toBe(true);
  expect(JSON.stringify(changes).length).toBeLessThan(2000);
  await f.writer.run(async (ctx) => {
    await ctx.runQuery(api.whiteboardSessions.getSceneBucket, args);
    expect(
      (await ctx.meta.getTransactionMetrics()).bytesRead.used,
    ).toBeLessThan(50000);
  });
  const caughtUp = { ...cursor, revision: changes.revision! };
  expect(
    (await f.writer.query(api.whiteboardSessions.getSceneBucket, {
      ...args,
      cursor: caughtUp,
    }))!.parts,
  ).toEqual([]);
  const outsider = f.t.withIdentity({ subject: "recording-leader-two" });
  await expect(
    outsider.query(api.whiteboardSessions.getSceneBucket, {
      ...args,
      cursor: caughtUp,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.t.query(api.whiteboardSessions.getSceneBucket, args),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    (await f.t.query(api.whiteboardSessions.getSceneBucket, {
      ...args,
      recordingToken: "valid-recording-token",
    }))!.parts,
  ).toEqual(changes.parts);
  for (let i = 3; i < MAX_WHITEBOARD_RECENT_UPDATES + 5; i++)
    await f.delta([element(ids[1], i)]);
  const fallback = (await f.writer.query(
    api.whiteboardSessions.getSceneBucket,
    args,
  ))!;
  expect(fallback.baseRevision).toBeNull();
  expect(JSON.parse(joinWhiteboardPayload(fallback.parts))).toEqual(
    expect.arrayContaining([old]),
  );
  const history = await f.t.run((ctx) =>
    ctx.db.query("whiteboardSceneUpdates").first(),
  );
  expect(history!.entries.length).toBeLessThanOrEqual(
    MAX_WHITEBOARD_RECENT_UPDATES,
  );
  expect(
    new TextEncoder().encode(JSON.stringify(history!.entries)).length,
  ).toBeLessThanOrEqual(MAX_WHITEBOARD_RECENT_BYTES);
  const wrongSource = (await f.writer.query(
    api.whiteboardSessions.getSceneBucket,
    { ...args, cursor: { ...caughtUp, sourceId: "earlier-manifest" } },
  ))!;
  expect(wrongSource.baseRevision).toBeNull();
  const wrongGeneration = (await f.writer.query(
    api.whiteboardSessions.getSceneBucket,
    { ...args, cursor: { ...caughtUp, generation: 99 } },
  ))!;
  expect(wrongGeneration.baseRevision).toBeNull();
});

test("hot-bucket checkpoints stay incremental across count and byte windows and preserve reload and access", async () => {
  const f = await setup();
  await f.ensure();
  const historic = element("historic", 1, { content: "x".repeat(250000) });
  const editingId = Array.from({ length: 1000 }, (_, i) => `editing-${i}`).find(
    (id) => whiteboardBucketId(id) === whiteboardBucketId(historic.id),
  )!;
  await f.delta([historic]);
  let cached = applyWhiteboardBucketResult(
    undefined,
    (await f.bucket(historic.id))!,
  )!;
  const firstCursor = cached.anchor!;
  let checkpoints = 0;
  for (let version = 1; version <= 120; version++) {
    await f.delta([
      element(editingId, version, {
        content: version > 60 ? "y".repeat(20000) : "",
        isDeleted: version === 80,
      }),
    ]);
    const response = (await f.writer.query(
      api.whiteboardSessions.getSceneBucket,
      {
        roomName: ROOM,
        bucketId: whiteboardBucketId(historic.id),
        cursor: cached.anchor,
      },
    ))!;
    expect(response.baseRevision).not.toBeNull();
    expect(joinWhiteboardPayload(response.parts)).not.toContain("historic");
    if (response.checkpoint) checkpoints++;
    cached = applyWhiteboardBucketResult(cached, response)!;
    expect(cached.elements.find((item) => item.id === editingId)!.version).toBe(
      version,
    );
    expect(cached.elements.find((item) => item.id === historic.id)).toEqual(
      historic,
    );
  }
  expect(checkpoints).toBeGreaterThan(3);
  expect(checkpoints).toBeLessThan(120);
  const reloaded = (await f.bucket(historic.id))!;
  expect(applyWhiteboardBucketResult(undefined, reloaded)!.elements).toEqual(
    cached.elements,
  );
  expect(
    (await f.writer.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId(historic.id),
      cursor: firstCursor,
    }))!.baseRevision,
  ).toBeNull();
  await expect(
    f.t.query(api.whiteboardSessions.getSceneBucket, {
      roomName: ROOM,
      bucketId: whiteboardBucketId(historic.id),
      cursor: cached.anchor,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});
