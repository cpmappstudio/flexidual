import { expect, test } from "vitest";
import {
  encodeWhiteboardLiveChanges,
  decodeWhiteboardLiveChanges,
  pendingWhiteboardLiveChanges,
  MAX_WHITEBOARD_LIVE_BYTES,
} from "@/lib/whiteboard-realtime";

const scope = {
  roomName: "course",
  liveRoomName: "activation",
  sourceId: "scene",
  generation: 2,
};
const stroke = (id = "drawing", version = 1, isDeleted = false) => ({
  id,
  version,
  versionNonce: version,
  isDeleted,
  index: "a0",
});

test("live deltas roundtrip long strokes and special identifiers without sending binary images", () => {
  const elements = [
    {
      ...stroke("__proto__"),
      type: "freedraw",
      points: Array.from({ length: 20_000 }, (_, i) => [i, i]),
    },
    { ...stroke("constructor"), type: "image", fileId: "image-id" },
    stroke("toString", 2, true),
  ];
  const packets = encodeWhiteboardLiveChanges(scope, elements);
  expect(packets[0].length).toBeGreaterThan(15 * 1024);
  expect(
    packets.flatMap((bytes) => decodeWhiteboardLiveChanges(bytes, scope)),
  ).toEqual(elements);
  expect(new TextDecoder().decode(packets[0])).not.toContain("dataURL");
});

test("bounds batches without cutting an element or silently changing versions", () => {
  const elements = [0, 1, 2].map((i) => ({
    ...stroke(String(i)),
    text: "á".repeat(2_000_000),
  }));
  const batches = encodeWhiteboardLiveChanges(scope, elements);
  expect(batches.length).toBeGreaterThan(1);
  expect(
    batches.every((bytes) => bytes.length <= MAX_WHITEBOARD_LIVE_BYTES),
  ).toBe(true);
  expect(
    batches.flatMap((bytes) => decodeWhiteboardLiveChanges(bytes, scope)),
  ).toEqual(elements);
});

test("rejects wrong occurrence, activation, manifest, generation and invalid elements", () => {
  const bytes = encodeWhiteboardLiveChanges(scope, [stroke()])[0];
  for (const key of [
    "roomName",
    "liveRoomName",
    "sourceId",
    "generation",
  ] as const)
    expect(() =>
      decodeWhiteboardLiveChanges(bytes, { ...scope, [key]: "wrong" }),
    ).toThrow("STALE_WHITEBOARD_LIVE");
  const invalid = new TextEncoder().encode(
    JSON.stringify({ ...scope, elements: [{ id: "drawing" }] }),
  );
  expect(() => decodeWhiteboardLiveChanges(invalid, scope)).toThrow(
    "INVALID_WHITEBOARD_ELEMENTS",
  );
  expect(() =>
    decodeWhiteboardLiveChanges(
      new Uint8Array(MAX_WHITEBOARD_LIVE_BYTES + 1),
      scope,
    ),
  ).toThrow("TOO_LARGE");
});

test("pending previews survive older snapshots, retain deletion and retire only when durable", () => {
  const preview = [stroke("drawing", 3), stroke("deleted", 2, true)];
  expect(
    pendingWhiteboardLiveChanges(preview, [
      stroke("drawing"),
      stroke("deleted"),
    ]),
  ).toEqual(preview);
  expect(pendingWhiteboardLiveChanges(preview, preview)).toEqual([]);
  expect(
    pendingWhiteboardLiveChanges(preview, [
      stroke("drawing", 4),
      stroke("deleted", 3, true),
    ]),
  ).toEqual([]);
});
