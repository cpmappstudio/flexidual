import { act, cleanup, render } from "@testing-library/react";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SharedWhiteboard } from "@/components/classroom/shared-whiteboard";
import type { WhiteboardFileRefs } from "@/lib/whiteboard-draft-storage";
import type { Id } from "@/convex/_generated/dataModel";
import { encodeWhiteboardLiveChanges } from "@/lib/whiteboard-realtime";

const state = vi.hoisted(() => ({
  props: null as ExcalidrawProps | null,
  mutation: vi.fn(),
  sceneHook: vi.fn(),
  access: vi.fn<(queries: unknown) => Record<string, unknown>>(() => ({})),
  room: {
    name: "recording-activation",
    state: "connected",
    on: vi.fn(),
    off: vi.fn(),
    remoteParticipants: new Map(),
    registerByteStreamHandler: vi.fn(),
    unregisterByteStreamHandler: vi.fn(),
    localParticipant: { identity: "recorder", publishData: vi.fn() },
  },
  scene: {
    elements: [
      {
        id: "recorded-drawing",
        version: 1,
        versionNonce: 1,
        index: "a0",
        isDeleted: false,
      },
    ] as unknown as Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0],
    fileRefs: {} as WhiteboardFileRefs,
  },
}));

vi.mock("@excalidraw/excalidraw/index.css", () => ({}));
vi.mock("next/dynamic", () => ({
  default: () => (props: ExcalidrawProps) => {
    state.props = props;
    return <div data-testid="recording-canvas" />;
  },
}));
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => state.room,
}));
vi.mock("convex/react", () => ({
  useMutation: () => state.mutation,
  useQueries: (queries: unknown) => state.access(queries),
}));
vi.mock("@/hooks/use-whiteboard-scene", () => ({
  useWhiteboardScene: (...args: unknown[]) => {
    state.sceneHook(...args);
    return {
      scene: state.scene,
      manifest: {
        format: 2,
        generation: 1,
        bucketIds: [],
        legacyOrder: [],
        fromLegacy: false,
        sourceId: "recording-manifest",
      },
      error: undefined,
    };
  },
}));
vi.mock("@/lib/error-tracking", () => ({
  reportRuntimeError: vi.fn(),
  reportWhiteboardDiagnostic: vi.fn(),
}));

const initialScene = state.scene;
beforeEach(() => {
  state.scene = initialScene;
  state.props = null;
  state.room.remoteParticipants.clear();
  state.access.mockImplementation(() => ({}));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("recording uses its reader token for live writer authorization without Clerk or Intl", async () => {
  vi.useFakeTimers();
  state.room.remoteParticipants.set("teacher", {
    identity: "teacher",
    metadata: JSON.stringify({ roomAdmin: true, convexUserId: "teacher-user" }),
  });
  state.access.mockReturnValue({ teacher: true });
  render(
    <SharedWhiteboard
      roomName="recording-room"
      recordingToken="recording-token"
      isReadonly
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
  let elements = state.scene.elements;
  const updateScene = vi.fn((value) => {
    if (value.elements) elements = value.elements;
  });
  const api = {
    updateScene,
    addFiles: vi.fn(),
    getSceneElementsIncludingDeleted: () => elements,
  };
  act(() =>
    state.props?.excalidrawAPI?.(api as unknown as ExcalidrawImperativeAPI),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
  const next = [{ ...elements[0], version: 2, versionNonce: 2 }];
  const bytes = encodeWhiteboardLiveChanges(
    {
      roomName: "recording-room",
      liveRoomName: "recording-activation",
      sourceId: "recording-manifest",
      generation: 1,
    },
    next,
  )[0];
  const handler = state.room.registerByteStreamHandler.mock.calls.at(-1)![1];
  await act(async () => {
    handler(
      {
        info: { size: bytes.length },
        async readAll({ signal }: { signal: AbortSignal }) {
          signal.throwIfAborted();
          return [bytes];
        },
        async *[Symbol.asyncIterator]() {
          yield bytes;
        },
      },
      { identity: "teacher" },
    );
    await vi.advanceTimersByTimeAsync(5);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
  expect(state.access).toHaveBeenCalledWith(
    expect.objectContaining({
      teacher: expect.objectContaining({
        args: expect.objectContaining({ recordingToken: "recording-token" }),
      }),
    }),
  );
  expect(elements).toEqual(next);
  expect(updateScene).toHaveBeenLastCalledWith(
    expect.objectContaining({ captureUpdate: "NEVER" }),
  );
  expect(state.mutation).not.toHaveBeenCalled();
});

test("recording downloads only visible images and fetches a deleted image when undo restores it", async () => {
  vi.useFakeTimers();
  const image = (index: number, isDeleted = index !== 0) => ({
    id: `image-element-${index}`,
    version: 1,
    versionNonce: 1,
    index: `a${index}`,
    type: "image",
    fileId: `image-${index}`,
    isDeleted,
  });
  state.scene = {
    elements: Array.from({ length: 20 }, (_, index) =>
      image(index),
    ) as unknown as typeof state.scene.elements,
    fileRefs: Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `image-${index}`,
        {
          storageId: `storage-${index}` as Id<"_storage">,
          url: `https://example.com/image-${index}`,
          mimeType: "image/svg+xml",
          created: 1,
        },
      ]),
    ),
  };
  const fetcher = vi.fn(async (url: unknown) => {
    expect(typeof url).toBe("string");
    return {
      ok: true,
      blob: async () => new Blob(["<svg/>"], { type: "image/svg+xml" }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const addFiles = vi.fn();
  const api = {
    updateScene: vi.fn(),
    addFiles,
    getSceneElementsIncludingDeleted: () => [],
  } as unknown as ExcalidrawImperativeAPI;
  const props = {
    roomName: "recording-images",
    recordingToken: "recording-token",
    isReadonly: true,
    presentationMode: true,
  };
  const view = render(<SharedWhiteboard {...props} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  act(() => {
    state.props?.excalidrawAPI?.(api);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    `/api/whiteboard-image?url=${encodeURIComponent("https://example.com/image-0")}`,
  );

  // Keep all twenty references; only restoring a deleted element makes its bytes necessary.
  state.scene = {
    ...state.scene,
    elements: state.scene.elements.map((element) =>
      element.id === "image-element-7"
        ? { ...element, version: 2, isDeleted: false }
        : element,
    ),
  };
  view.rerender(<SharedWhiteboard {...props} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe(
    `/api/whiteboard-image?url=${encodeURIComponent("https://example.com/image-7")}`,
  );
  expect(state.mutation).not.toHaveBeenCalled();
});

test("recording receives its scene and signals readiness without Clerk or Intl providers", async () => {
  vi.useFakeTimers();
  localStorage.clear();
  const ready = vi.fn();
  const updateScene = vi.fn();
  const api = {
    updateScene,
    addFiles: vi.fn(),
    getSceneElementsIncludingDeleted: () => [],
  } as unknown as ExcalidrawImperativeAPI;

  // Keep the actual Clerk and next-intl modules: /recording has neither provider.
  const view = render(
    <SharedWhiteboard
      roomName="recording-room"
      recordingToken="recording-token"
      isReadonly
      presentationMode
      onReady={ready}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.queryByTestId("recording-canvas")).not.toBeNull();
  expect(state.props?.viewModeEnabled).toBe(true);
  expect(state.sceneHook).toHaveBeenCalledWith(
    "recording-room",
    "recording-activation",
    true,
    "recording-token",
  );

  act(() => {
    state.props?.excalidrawAPI?.(api);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(updateScene).toHaveBeenCalledWith(
    expect.objectContaining({ elements: state.scene.elements }),
  );
  expect(ready).toHaveBeenCalledTimes(1);
  expect(state.mutation).not.toHaveBeenCalled();
});
