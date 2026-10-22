import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendWhiteboardBucketHistory,
  applyWhiteboardBucketResult,
  readWhiteboardBucketHistory,
  MAX_WHITEBOARD_RECENT_UPDATES,
  MAX_WHITEBOARD_RECENT_BYTES,
  type WhiteboardBucketHistory,
  type WhiteboardBucketResult,
} from "../lib/whiteboard-bucket-updates";
import {
  joinWhiteboardPayload,
  splitWhiteboardPayload,
  whiteboardJsonBytes,
} from "../lib/whiteboard-elements";

const shape = (id: string, version = 1, extra = {}) => ({
  id,
  version,
  versionNonce: version,
  ...extra,
});
const snapshot = (elements = [shape("original")]): WhiteboardBucketResult => ({
  generation: 0,
  sourceId: "scene",
  revision: 1,
  baseRevision: null,
  parts: splitWhiteboardPayload(JSON.stringify(elements)),
});

test("recent changes remain byte/count bounded and missed history requires a full snapshot", () => {
  let history: WhiteboardBucketHistory | undefined;
  for (let revision = 1; revision <= 40; revision++)
    history = appendWhiteboardBucketHistory(history, 0, revision - 1, [
      shape(`stroke-${revision}`),
    ]);
  assert.equal(history!.entries.length, MAX_WHITEBOARD_RECENT_UPDATES);
  assert(
    whiteboardJsonBytes(JSON.stringify(history!.entries)) <=
      MAX_WHITEBOARD_RECENT_BYTES,
  );
  assert.equal(
    readWhiteboardBucketHistory(history, {
      sourceId: "scene",
      generation: 0,
      revision: 1,
    }),
    null,
  );
  const parts = readWhiteboardBucketHistory(history, {
    sourceId: "scene",
    generation: 0,
    revision: 39,
  });
  assert.deepEqual(JSON.parse(joinWhiteboardPayload(parts!.parts)), [
    shape("stroke-40"),
  ]);
  history = appendWhiteboardBucketHistory(history, 0, 40, [
    shape("huge", 1, { text: "😀".repeat(20000) }),
  ]);
  assert.equal(history.entries.length, 0);
  assert.equal(
    readWhiteboardBucketHistory(history, {
      sourceId: "scene",
      generation: 0,
      revision: 40,
    }),
    null,
  );
  assert.deepEqual(
    readWhiteboardBucketHistory(history, {
      sourceId: "scene",
      generation: 0,
      revision: 41,
    }),
    { parts: [], checkpoint: false },
  );
  assert.equal(
    readWhiteboardBucketHistory(history, {
      sourceId: "scene",
      generation: 1,
      revision: 41,
    }),
    null,
  );
});

test("replaying, skipping and reordering responses preserves drawings, tombstones and snapshot anchors", () => {
  let cached = applyWhiteboardBucketResult(undefined, snapshot());
  const parts = splitWhiteboardPayload(
    JSON.stringify([
      shape("constructor"),
      shape("original", 2, { isDeleted: true }),
    ]),
  );
  const delta = { ...snapshot(), baseRevision: 1, revision: 3, parts };
  cached = applyWhiteboardBucketResult(cached, delta);
  assert.equal(cached!.anchor!.revision, 1);
  assert.equal(
    cached!.elements.find((element) => element.id === "original")!.isDeleted,
    true,
  );
  const replayed = applyWhiteboardBucketResult(cached, { ...delta });
  assert.deepEqual(replayed!.elements, cached!.elements);
  assert.equal(applyWhiteboardBucketResult(cached, snapshot()), cached);
  assert.equal(applyWhiteboardBucketResult(undefined, delta), undefined);
  assert.equal(
    applyWhiteboardBucketResult(cached, {
      ...delta,
      baseRevision: 4,
      revision: 5,
    }),
    undefined,
  );
  const replacement = applyWhiteboardBucketResult(cached, {
    ...snapshot([shape("replacement")]),
    sourceId: "new-scene",
  });
  assert.deepEqual(replacement!.elements, [shape("replacement")]);
  assert.equal(replacement!.anchor!.sourceId, "new-scene");
});

test("a journal discontinuity never hides missed writes or lets stale versions resurrect a deletion", () => {
  let history = appendWhiteboardBucketHistory(undefined, 0, 1, [
    shape("item", 2, { isDeleted: true }),
  ]);
  history = appendWhiteboardBucketHistory(history, 0, 2, [shape("item", 1)]);
  const parts = readWhiteboardBucketHistory(history, {
    sourceId: "scene",
    generation: 0,
    revision: 1,
  });
  assert.equal(
    JSON.parse(joinWhiteboardPayload(parts!.parts))[0].isDeleted,
    true,
  );
  history = appendWhiteboardBucketHistory(history, 0, 9, [shape("after-gap")]);
  assert.equal(
    readWhiteboardBucketHistory(history, {
      sourceId: "scene",
      generation: 0,
      revision: 2,
    }),
    null,
  );
});

test("applied checkpoints renew a hot bucket by count and bytes without downloading its history", () => {
  for (const changeBytes of [0, 20000]) {
    const original = shape("historic", 1, { text: "x".repeat(2000000) });
    let cached = applyWhiteboardBucketResult(undefined, snapshot([original]))!;
    let history: WhiteboardBucketHistory | undefined;
    let checkpoints = 0;
    for (let revision = 2; revision <= 121; revision++) {
      const change = shape("editing", revision, {
        text: "y".repeat(changeBytes),
        isDeleted: revision === 80,
      });
      history = appendWhiteboardBucketHistory(history, 0, revision - 1, [
        change,
      ]);
      const changes = readWhiteboardBucketHistory(history, cached.anchor!);
      assert(changes, "a reader applying each response never loses its window");
      assert(!joinWhiteboardPayload(changes.parts).includes("historic"));
      const before = cached.anchor!.revision;
      const result = {
        generation: 0,
        sourceId: "scene",
        revision,
        baseRevision: before,
        ...changes,
      };
      cached = applyWhiteboardBucketResult(cached, result)!;
      assert.equal(
        cached.elements.find((item) => item.id === "editing")!.version,
        revision,
      );
      assert.deepEqual(
        cached.elements.find((item) => item.id === "historic"),
        original,
      );
      if (changes.checkpoint) {
        checkpoints++;
        assert.equal(cached.anchor!.revision, revision);
        assert.equal(applyWhiteboardBucketResult(cached, result), cached);
      } else assert.equal(cached.anchor!.revision, before);
    }
    assert(
      checkpoints > 0 && checkpoints < 120,
      "renew in batches, not per edit",
    );
    assert.equal(checkpoints, changeBytes ? 60 : 7);
    // A genuinely disconnected reader still needs the authoritative snapshot.
    assert.equal(readWhiteboardBucketHistory(history, snapshotCursor(1)), null);
  }
});

const snapshotCursor = (revision: number) => ({
  sourceId: "scene",
  generation: 0,
  revision,
});

test("a checkpoint cannot advance a missing base or revive an older response", () => {
  const cached = applyWhiteboardBucketResult(undefined, snapshot())!;
  const result = {
    ...snapshot([shape("editing", 2)]),
    revision: 17,
    baseRevision: 1,
    checkpoint: true,
  };
  assert.equal(applyWhiteboardBucketResult(undefined, result), undefined);
  assert.equal(
    applyWhiteboardBucketResult(cached, { ...result, baseRevision: 3 }),
    undefined,
  );
  const advanced = applyWhiteboardBucketResult(cached, result)!;
  assert.equal(advanced.anchor!.revision, 17);
  assert.equal(
    applyWhiteboardBucketResult(advanced, { ...result, revision: 16 }),
    advanced,
  );
});
