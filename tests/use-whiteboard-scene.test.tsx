import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { useWhiteboardScene } from "@/hooks/use-whiteboard-scene";

const state = vi.hoisted(() => ({
  manifest: null as null | {
    format: 1 | 2;
    generation: number;
    bucketIds: number[];
    legacyOrder: string[];
    fromLegacy: boolean;
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
    state.queries(queries);
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
