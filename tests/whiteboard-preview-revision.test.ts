import assert from "node:assert/strict";
import { test } from "node:test";
import { whiteboardPreviewRevision } from "../lib/whiteboard-preview-revision";

test("preview signatures are canonical and retain deletion, order and special-ID versions without serializing stroke points", async () => {
  const elements = ["__proto__", "constructor", "toString"].map((id, i) => ({
    id,
    version: 1,
    versionNonce: i,
    index: `a${i}`,
    isDeleted: false,
    points: Array.from({ length: 9000 }, (_, n) => [n, n]),
  }));
  const revision = await whiteboardPreviewRevision(elements);
  assert.match(revision, /^[a-f0-9]{64}$/);
  assert.equal(
    await whiteboardPreviewRevision([...elements].reverse()),
    revision,
  );
  assert.equal(
    await whiteboardPreviewRevision(
      elements.map(({ points, ...element }) => element),
    ),
    revision,
  );
  for (const change of [
    { version: 2 },
    { versionNonce: 9 },
    { isDeleted: true },
    { index: "b0" },
  ]) {
    assert.notEqual(
      await whiteboardPreviewRevision([
        { ...elements[0], ...change },
        ...elements.slice(1),
      ]),
      revision,
    );
  }
  assert.equal(await whiteboardPreviewRevision(elements), revision);
});
