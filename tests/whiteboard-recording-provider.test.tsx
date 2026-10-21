import { act, cleanup, render } from "@testing-library/react";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SharedWhiteboard } from "@/components/classroom/shared-whiteboard";
import type { WhiteboardFileRefs } from "@/lib/whiteboard-draft-storage";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  props: null as ExcalidrawProps | null,
  mutation: vi.fn(),
  sceneHook: vi.fn(),
  room: {
    name: "recording-activation",
    state: "connected",
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: { publishData: vi.fn() },
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
vi.mock("convex/react", () => ({ useMutation: () => state.mutation }));
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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
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
