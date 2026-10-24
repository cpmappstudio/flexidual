import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { useWhiteboardScene } from "@/hooks/use-whiteboard-scene";
import { splitWhiteboardPayload } from "@/lib/whiteboard-elements";
import {
  appendWhiteboardBucketHistory,
  readWhiteboardBucketHistory,
  type WhiteboardBucketHistory,
} from "@/lib/whiteboard-bucket-updates";

const state = vi.hoisted(() => ({
  manifest: null as null | {
    format: 1 | 2;
    generation: number;
    bucketIds: number[];
    legacyOrder: string[];
    fromLegacy: boolean;
    sourceId?: string;
  },
  buckets: {} as Record<string, unknown>,
  files: { fileRefs: {} },
  legacy: undefined as unknown,
  queries: vi.fn(),
  query: vi.fn(),
  ensure: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useMutation: () => state.ensure,
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(ref);
    state.query(name, args);
    if (args === "skip") return undefined;
    if (name.endsWith(":getSceneManifest")) return state.manifest;
    if (name.endsWith(":getSceneFiles")) return state.files;
    return state.legacy;
  },
  useQueries: (queries: unknown) => {
    // Record occupied bucket subscriptions, not the disabled notebook-image hook.
    if (Object.keys(queries as object).length) state.queries(queries);
    return state.buckets;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.manifest = {
    format: 2,
    generation: 1,
    bucketIds: [4, 12],
    legacyOrder: [],
    fromLegacy: true,
  };
  state.files = { fileRefs: {} };
  state.buckets = {
    4: {
      generation: 1,
      parts: [
        JSON.stringify([{ id: "a", version: 1, versionNonce: 1, index: "a0" }]),
      ],
    },
    12: {
      generation: 1,
      parts: [
        JSON.stringify([{ id: "b", version: 1, versionNonce: 1, index: "a1" }]),
      ],
    },
  };
  state.ensure.mockResolvedValue(state.manifest);
});
afterEach(cleanup);

test("subscribes only to occupied buckets, never to the complete legacy scene", () => {
  const { result } = renderHook(() =>
    useWhiteboardScene("room", "activation", true),
  );
  expect(Object.keys(state.queries.mock.calls[0][0])).toEqual(["4", "12"]);
  expect(state.query).toHaveBeenCalledWith(
    "whiteboardSessions:getScene",
    "skip",
  );
  expect(result.current.scene?.elements.map((item) => item.id)).toEqual([
    "a",
    "b",
  ]);
  expect(state.ensure).not.toHaveBeenCalled();
});

test("an image-only update preserves the drawing array and bucket subscriptions", () => {
  const { result, rerender } = renderHook(() =>
    useWhiteboardScene("room", "activation", true),
  );
  const elements = result.current.scene?.elements;
  const requests = state.queries.mock.calls[0][0];
  state.files = { fileRefs: { image: {} } };
  rerender();
  expect(result.current.scene?.elements).toBe(elements);
  expect(state.queries.mock.calls.at(-1)?.[0]).toBe(requests);
});

test("does not expose a partial scene while one bucket is still loading", () => {
  delete state.buckets[12];
  const { result } = renderHook(() =>
    useWhiteboardScene("room", "activation", false),
  );
  expect(result.current.scene).toBeUndefined();
});

test("initializes a legacy writer under the current activation before mounting", async () => {
  state.manifest = {
    format: 1,
    generation: 0,
    bucketIds: [],
    legacyOrder: [],
    fromLegacy: true,
  };
  state.legacy = {
    elements: [{ id: "legacy", version: 1, versionNonce: 1 }],
    fileRefs: {},
  };
  const { result } = renderHook(() =>
    useWhiteboardScene("room", "activation", false),
  );
  await act(async () => {});
  expect(result.current.scene).toBeUndefined();
  expect(state.ensure).toHaveBeenCalledExactlyOnceWith({
    roomName: "room",
    expectedLiveRoomName: "activation",
  });
});

test("propagates a bucket permission failure instead of mounting an empty canvas", () => {
  state.buckets[4] = new Error("PERMISSION_DENIED");
  expect(() =>
    renderHook(() => useWhiteboardScene("room", "activation", true)),
  ).toThrow("PERMISSION_DENIED");
});

test("clears an initialization failure when another writer recovers the complete scene", async () => {
  const recovered = state.manifest;
  state.manifest = null;
  state.ensure.mockRejectedValueOnce(new Error("temporary failure"));
  const { result, rerender } = renderHook(() =>
    useWhiteboardScene("room", "activation", false),
  );
  await act(async () => {});
  expect(result.current.error).toBeInstanceOf(Error);
  expect(result.current.scene).toBeUndefined();
  state.manifest = recovered;
  rerender();
  expect(result.current.error).toBeUndefined();
  expect(result.current.scene?.elements.map((item) => item.id)).toEqual([
    "a",
    "b",
  ]);
  state.buckets = { ...state.buckets, 4: new Error("PERMISSION_DENIED") };
  expect(() => rerender()).toThrow("PERMISSION_DENIED");
});

test("a new activation retries recovery without retaining the previous failure", async () => {
  state.manifest = null;
  state.ensure.mockRejectedValueOnce(new Error("STALE_LIVE_ACTIVATION"));
  const { result, rerender } = renderHook(
    ({ activation }) => useWhiteboardScene("room", activation, false),
    { initialProps: { activation: "old" } },
  );
  await act(async () => {});
  expect(result.current.error).toBeInstanceOf(Error);
  rerender({ activation: "new" });
  await act(async () => {});
  expect(result.current.error).toBeUndefined();
  expect(result.current.scene).toBeUndefined();
  expect(state.ensure).toHaveBeenLastCalledWith({
    roomName: "room",
    expectedLiveRoomName: "new",
  });
});

test("a snapshot anchor survives skipped deltas, pending query results and recovery without remounting", () => {
  state.manifest!.sourceId = "scene";
  for (const id of [4, 12])
    state.buckets[id] = {
      ...(state.buckets[id] as object),
      sourceId: "scene",
      revision: 1,
      baseRevision: null,
    };
  const { result, rerender } = renderHook(() =>
    useWhiteboardScene("room", "activation", true),
  );
  expect(state.queries.mock.calls.at(-1)![0][4].args.cursor).toEqual({
    sourceId: "scene",
    generation: 1,
    revision: 1,
  });
  state.buckets = {
    ...state.buckets,
    4: {
      generation: 1,
      sourceId: "scene",
      revision: 3,
      baseRevision: 1,
      parts: [
        JSON.stringify([
          {
            id: "a",
            version: 2,
            versionNonce: 2,
            isDeleted: true,
            index: "a0",
          },
          { id: "new", version: 1, versionNonce: 1, index: "a2" },
        ]),
      ],
    },
  };
  rerender();
  expect(result.current.scene!.elements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "a", isDeleted: true }),
      expect.objectContaining({ id: "b" }),
      expect.objectContaining({ id: "new" }),
    ]),
  );
  expect(state.queries.mock.calls.at(-1)![0][4].args.cursor.revision).toBe(1);
  state.buckets = { ...state.buckets, 4: undefined };
  rerender();
  expect(result.current.scene!.elements).toHaveLength(3);
  state.manifest = { ...state.manifest!, bucketIds: [4, 12, 21] };
  rerender();
  expect(result.current.scene).toBeUndefined();
  state.buckets = {
    ...state.buckets,
    4: {
      generation: 1,
      sourceId: "scene",
      revision: 8,
      baseRevision: 7,
      parts: [],
    },
  };
  rerender();
  expect(result.current.scene).toBeUndefined();
  expect(state.queries.mock.calls.at(-1)![0][4].args.cursor).toBeUndefined();
  state.buckets = {
    ...state.buckets,
    4: {
      generation: 1,
      sourceId: "scene",
      revision: 8,
      baseRevision: null,
      parts: [
        JSON.stringify([{ id: "recovered", version: 1, versionNonce: 1 }]),
      ],
    },
    21: {
      generation: 1,
      sourceId: "scene",
      revision: 1,
      baseRevision: null,
      parts: ["[]"],
    },
  };
  rerender();
  expect(result.current.scene!.elements.map((element) => element.id)).toEqual([
    "b",
    "recovered",
  ]);
  expect(state.queries.mock.calls.at(-1)![0][4].args.cursor.revision).toBe(8);
});

test("a replacement manifest or room cannot reuse the preceding bucket cache or cursor", () => {
  state.manifest!.sourceId = "old-scene";
  for (const id of [4, 12])
    state.buckets[id] = {
      ...(state.buckets[id] as object),
      sourceId: "old-scene",
      revision: 1,
      baseRevision: null,
    };
  const { result, rerender } = renderHook(
    ({ room }) => useWhiteboardScene(room, "activation", true),
    { initialProps: { room: "first" } },
  );
  expect(result.current.scene!.elements).toHaveLength(2);
  state.manifest = { ...state.manifest!, sourceId: "new-scene" };
  state.buckets = {};
  rerender({ room: "second" });
  expect(result.current.scene).toBeUndefined();
  expect(state.queries.mock.calls.at(-1)![0][4].args).toEqual({
    roomName: "second",
    bucketId: 4,
  });
});

test("many edits in one bucket renew only applied checkpoints while queries are delayed", () => {
  state.manifest = { ...state.manifest!, sourceId: "scene", bucketIds: [4] };
  state.buckets = {
    4: {
      generation: 1,
      sourceId: "scene",
      revision: 1,
      baseRevision: null,
      parts: splitWhiteboardPayload(
        JSON.stringify([
          {
            id: "historic",
            version: 1,
            versionNonce: 1,
            content: "x".repeat(250000),
          },
        ]),
      ),
    },
  };
  const { result, rerender } = renderHook(() =>
    useWhiteboardScene("room", "activation", true),
  );
  let history: WhiteboardBucketHistory | undefined;
  const cursor = () => state.queries.mock.calls.at(-1)![0][4].args.cursor;
  let renewals = 0;
  for (let revision = 2; revision <= 121; revision++) {
    const before = cursor();
    const change = {
      id: "editing",
      version: revision,
      versionNonce: revision,
      content: revision > 60 ? "y".repeat(20000) : "",
    };
    history = appendWhiteboardBucketHistory(history, 1, revision - 1, [change]);
    // A pending subscription must keep the already applied complete cache.
    state.buckets = { 4: undefined };
    rerender();
    expect(cursor()).toEqual(before);
    const changes = readWhiteboardBucketHistory(history, before);
    expect(changes).not.toBeNull();
    state.buckets = {
      4: {
        generation: 1,
        sourceId: "scene",
        revision,
        baseRevision: before.revision,
        ...changes,
      },
    };
    rerender();
    expect(result.current.scene!.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "historic" }),
        expect.objectContaining({ id: "editing", version: revision }),
      ]),
    );
    if (changes!.checkpoint) {
      renewals++;
      expect(cursor().revision).toBe(revision);
    } else expect(cursor()).toEqual(before);
  }
  expect(renewals).toBeGreaterThan(3);
  expect(renewals).toBeLessThan(120);
});

test("ignores a delayed initialization failure from an obsolete activation", async () => {
  state.manifest = null;
  let reject!: (error: Error) => void;
  state.ensure.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const { result, rerender } = renderHook(
    ({ activation }) => useWhiteboardScene("room", activation, false),
    { initialProps: { activation: "old" } },
  );
  rerender({ activation: "new" });
  await act(async () => reject(new Error("STALE_LIVE_ACTIVATION")));
  expect(result.current.error).toBeUndefined();
  expect(result.current.scene).toBeUndefined();
});
