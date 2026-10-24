import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { useNotebookPageScene } from "@/hooks/use-notebook-page-scene";
import { useWhiteboardScene } from "@/hooks/use-whiteboard-scene";

const state = vi.hoisted(() => ({
  manifest: { sourceId: "source-a", generation: 0, bucketIds: [1] },
  elements: [] as object[],
  files: {} as Record<string, unknown>,
  queries: vi.fn(),
  livePage: undefined as string | undefined,
}));
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    if (!state.livePage) return state.manifest;
    expect(getFunctionName(ref)).toBe("whiteboardSessions:getSceneManifest");
    return {
      ...state.manifest,
      format: 2,
      fromLegacy: false,
      legacyOrder: [],
      notebookPageId: state.livePage,
    };
  },
  useQueries: (
    queries: Record<
      string,
      {
        query: Parameters<typeof getFunctionName>[0];
        args: { fileIds: string[] };
      }
    >,
  ) => {
    state.queries(queries);
    if (
      Object.values(queries).some(
        (q) =>
          getFunctionName(q.query).endsWith(":getBucket") ||
          getFunctionName(q.query).endsWith(":getSceneBucket"),
      )
    )
      return {
        1: {
          sourceId: state.manifest.sourceId,
          generation: 0,
          parts: [
            JSON.stringify(
              state.elements.map((element) => ({
                versionNonce: 1,
                ...element,
              })),
            ),
          ],
        },
      };
    return Object.fromEntries(
      Object.entries(queries).map(([key, q]) => [
        key,
        Object.fromEntries(
          q.args.fileIds
            .filter((id) => state.files[id])
            .map((id) => [id, state.files[id]]),
        ),
      ]),
    );
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.manifest = { sourceId: "source-a", generation: 0, bucketIds: [1] };
  state.elements = [];
  state.files = {};
  state.livePage = undefined;
});
afterEach(cleanup);

test("live notebook readers and recorders use bounded, source-scoped subscriptions, never room-wide files", () => {
  state.livePage = "page-a";
  state.elements = Array.from({ length: 65 }, (_, i) => ({
    id: `image-${i}`,
    type: "image",
    fileId: `file-${i}`,
    version: 1,
  }));
  const { result, rerender } = renderHook(() =>
    useWhiteboardScene("room", "activation", true, "record-token"),
  );
  expect(result.current.scene!.elements).toHaveLength(65);
  let queries = state.queries.mock.calls.at(-1)![0];
  expect(Object.keys(queries)).toHaveLength(2);
  for (const q of Object.values(queries) as {
    query: Parameters<typeof getFunctionName>[0];
    args: {
      roomName: string;
      pageId: string;
      recordingToken: string;
      fileIds: string[];
    };
  }[]) {
    expect(getFunctionName(q.query)).toBe(
      "whiteboardSessions:getPresentedFiles",
    );
    expect(q.args).toMatchObject({
      roomName: "room",
      pageId: "page-a",
      recordingToken: "record-token",
    });
    expect(q.args.fileIds.length).toBeLessThanOrEqual(64);
  }
  state.livePage = "page-b";
  state.manifest = { ...state.manifest, sourceId: "source-b" };
  state.elements = [{ id: "second", version: 1 }];
  rerender();
  expect(result.current.scene!.elements.map((element) => element.id)).toEqual([
    "second",
  ]);
  queries = state.queries.mock.calls.at(-1)![0];
  expect(queries).toEqual({});
});

test("images load by page in bounded groups, excluding deleted images and keeping special identifiers", () => {
  state.elements = Array.from({ length: 65 }, (_, i) => ({
    id: `shape-${i}`,
    type: "image",
    fileId: `file-${i}`,
    version: 1,
    versionNonce: 1,
  }));
  state.elements.push(
    {
      id: "hidden",
      type: "image",
      fileId: "hidden",
      isDeleted: true,
      version: 1,
    },
    { id: "special", type: "image", fileId: "constructor", version: 1 },
  );
  state.files = {
    constructor: {
      storageId: "storage",
      url: "https://example.com/image",
      mimeType: "image/png",
      created: 1,
    },
  };
  const { result } = renderHook(() =>
    useNotebookPageScene("page-a" as Id<"courseNotebookPages">),
  );
  const fileQueries = state.queries.mock.calls.at(-1)![0];
  expect(Object.keys(fileQueries)).toHaveLength(2);
  for (const q of Object.values(fileQueries) as {
    args: { pageId: string; fileIds: string[] };
  }[]) {
    expect(q.args.pageId).toBe("page-a");
    expect(q.args.fileIds.length).toBeLessThanOrEqual(64);
    expect(q.args.fileIds).not.toContain("hidden");
  }
  expect(Object.hasOwn(result.current.scene!.fileRefs!, "constructor")).toBe(
    true,
  );
});

test("a different page never receives the previous page's cached drawing data", () => {
  state.elements = [{ id: "first", version: 1 }];
  const { result, rerender } = renderHook(
    ({ pageId }) => useNotebookPageScene(pageId as Id<"courseNotebookPages">),
    { initialProps: { pageId: "page-a" } },
  );
  expect(result.current.scene!.elements[0].id).toBe("first");
  state.manifest = { ...state.manifest, sourceId: "source-b" };
  state.elements = [{ id: "second", version: 1 }];
  rerender({ pageId: "page-b" });
  expect(result.current.scene!.elements.map((item) => item.id)).toEqual([
    "second",
  ]);
});
