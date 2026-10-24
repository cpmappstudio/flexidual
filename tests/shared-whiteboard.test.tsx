import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createHash } from "node:crypto";
import {
  StrictMode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "@/convex/_generated/api";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { Id } from "@/convex/_generated/dataModel";
import { SharedWhiteboard } from "@/components/classroom/shared-whiteboard";
import { NotebookPageEditor } from "@/components/whiteboard/notebook-page-editor";
import {
  WhiteboardEditor,
  type WhiteboardEditorProps,
} from "@/components/whiteboard/whiteboard-editor";
import { useWhiteboardRealtime } from "@/hooks/use-whiteboard-realtime";
import type { Room } from "livekit-client";
import {
  setupRecordingContext,
  storeWhiteboardImage,
} from "./fixtures/whiteboard";
import {
  joinWhiteboardPayload,
  mergeWhiteboardElements,
  splitWhiteboardPayload,
  whiteboardBucketId,
} from "@/lib/whiteboard-elements";
import {
  whiteboardDraftStorage,
  whiteboardSceneRevision,
} from "@/lib/whiteboard-draft-storage";
import type { WhiteboardBucketCursor } from "@/lib/whiteboard-bucket-updates";
import {
  encodeWhiteboardLiveChanges,
  MAX_WHITEBOARD_LIVE_BYTES,
  WHITEBOARD_SCENE_TOPIC,
} from "@/lib/whiteboard-realtime";

vi.mock("@excalidraw/excalidraw/index.css", () => ({}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const state = vi.hoisted(() => ({
  props: {} as ExcalidrawProps,
  scene: null as
    | FunctionReturnType<typeof api.whiteboardSessions.getScene>
    | undefined,
  manifest: {
    format: 2 as 1 | 2,
    generation: 1,
    bucketIds: [] as number[],
    legacyOrder: [] as string[],
    fromLegacy: true,
    sourceId: undefined as string | undefined,
  } as {
    format: 1 | 2;
    generation: number;
    bucketIds: number[];
    legacyOrder: string[];
    fromLegacy: boolean;
    sourceId?: string;
    notebookPageId?: Id<"courseNotebookPages">;
  },
  recoveryError: undefined as unknown,
  sceneHook: vi.fn(),
  roomContext: vi.fn(),
  Canvas: undefined as ComponentType<ExcalidrawProps> | undefined,
  buckets: {} as Record<string, unknown>,
  query: vi.fn(),
  queries: vi.fn(),
  permissions: {} as Record<string, boolean>,
  audience: ["student"] as string[] | undefined,
  save: vi.fn(),
  otherMutation: vi.fn(),
  previewStart: vi.fn(),
  previewExport: vi.fn(),
  reportError: vi.fn(),
  reportDiagnostic: vi.fn(),
  token: vi.fn(async () => "test-token"),
  room: {
    name: "test-live-room",
    state: "connected",
    on: vi.fn(),
    off: vi.fn(),
    remoteParticipants: new Map(),
    registerByteStreamHandler: vi.fn(),
    unregisterByteStreamHandler: vi.fn(),
    localParticipant: {
      identity: "local",
      metadata: undefined as string | undefined,
      publishData: vi.fn(),
      sendBytes: vi.fn(),
    },
  },
}));
vi.mock("@excalidraw/excalidraw", () => ({
  exportToBlob: state.previewExport,
}));
vi.mock("@/hooks/use-notebook-page-scene", () => ({
  useNotebookPageScene: () => ({
    scene: state.scene ?? { elements: [], fileRefs: {} },
    manifest: state.manifest,
  }),
}));
vi.mock("@/lib/error-tracking", () => ({
  reportRuntimeError: state.reportError,
  reportWhiteboardDiagnostic: state.reportDiagnostic,
}));
vi.mock("next/dynamic", () => ({
  default: () => (props: ExcalidrawProps) => {
    state.props = props;
    const Canvas = state.Canvas;
    return Canvas ? <Canvas {...props} /> : null;
  },
}));
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => {
    state.roomContext();
    return state.room;
  },
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: state.token }),
}));
vi.mock("@/hooks/use-whiteboard-scene", () => ({
  useWhiteboardScene: (...args: unknown[]) => state.sceneHook(...args),
}));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => state.query(...args),
  useQueries: (
    queries: Record<string, { query: Parameters<typeof getFunctionName>[0] }>,
  ) =>
    !Object.keys(queries).length
      ? {}
      : Object.values(queries).some((entry) =>
            getFunctionName(entry.query).endsWith(":getRealtimeAudience"),
          )
        ? { audience: state.audience }
        : Object.values(queries).some((entry) =>
              getFunctionName(entry.query).endsWith(":getRealtimeWriter"),
            )
          ? Object.fromEntries(
              Object.keys(queries).map((identity) => [
                identity,
                state.permissions[identity],
              ]),
            )
          : (state.queries(queries) ?? {}),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    return name === "whiteboardSessions:applySceneDelta" ||
      name === "courseNotebook:applyDelta"
      ? state.save
      : name === "courseNotebookFiles:beginPreview"
        ? state.previewStart
        : state.otherMutation;
  },
}));

type ChangeArgs = Parameters<NonNullable<ExcalidrawProps["onChange"]>>;
const shape = (id: string, version = 1, nonce = version) =>
  ({
    id,
    version,
    versionNonce: nonce,
    isDeleted: false,
    index: id === "confirmed" ? "a1" : id === "pending-stroke" ? "a2" : "a0",
  }) as ChangeArgs[0][number];
const files: ChangeArgs[2] = {};
const cloudScene = (
  elements: ChangeArgs[0],
): NonNullable<typeof state.scene> => ({
  _id: "scene" as Id<"whiteboardSessions">,
  _creationTime: 0,
  roomName: "test-room",
  elements: [...elements],
  fileRefs: undefined,
  updatedAt: 1,
});
const imageFile = (id = "image-file"): BinaryFileData => ({
  id: id as BinaryFileData["id"],
  dataURL: "data:image/svg+xml;base64,PHN2Zy8+" as BinaryFileData["dataURL"],
  mimeType: "image/svg+xml",
  created: 1,
});
const imageElement = (file = imageFile()) =>
  ({
    ...shape("image"),
    type: "image",
    fileId: file.id,
    status: "saved",
    scale: [1, 1],
    crop: null,
  }) as ChangeArgs[0][number];
const imageRef = (file = imageFile()) => ({
  storageId: "storage" as Id<"_storage">,
  url: "https://example.com/image",
  mimeType: file.mimeType,
  created: 1,
});
function change(elements: ChangeArgs[0], scrollX = 0, sceneFiles = files) {
  act(() =>
    state.props.onChange?.(
      elements,
      { scrollX, scrollY: 0, zoom: { value: 1 } } as ChangeArgs[1],
      sceneFiles,
    ),
  );
}
async function flush(milliseconds = 350) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}
async function mount(roomName = "test-room", isReadonly = false) {
  const view = render(
    <SharedWhiteboard roomName={roomName} isReadonly={isReadonly} />,
  );
  await flush(1);
  return view;
}
function downloaded(file = imageFile()) {
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => ({
    ok: true,
    blob: async () => new Blob(["image"], { type: file.mimeType }),
    json: async () => (options?.method === "POST" ? imageRef(file) : {}),
  }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "FileReader",
    class {
      result = file.dataURL;
      onload?: () => void;
      readAsDataURL() {
        this.onload?.();
      }
    },
  );
  return fetcher;
}
function cloudWrites() {
  // Apply the transmitted delta, never substitute it with a full scene.
  state.save.mockImplementation(async (args) => {
    const next = mergeWhiteboardElements(
      state.scene?.elements ?? [],
      JSON.parse(joinWhiteboardPayload(args.parts)),
    );
    state.scene = {
      ...cloudScene(next as ChangeArgs[0]),
      fileRefs: state.scene?.fileRefs,
    };
    return {
      changed: true,
      generation: state.manifest.generation,
      conflictsParts: [],
    };
  });
}
function quota(allowShrinking = false) {
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    const previous = this.getItem(key);
    if (allowShrinking && previous && value.length <= previous.length)
      return write.call(this, key, value);
    throw new DOMException("Full", "QuotaExceededError");
  });
}

function enableLiveWriter(identity = "local") {
  state.manifest.sourceId = "test-manifest";
  const metadata = JSON.stringify({
    roomAdmin: true,
    convexUserId: "writer-user",
  });
  if (identity === "local") state.room.localParticipant.metadata = metadata;
  else state.room.remoteParticipants.set(identity, { identity, metadata });
  state.permissions[identity] = true;
}
async function liveChanges(
  elements: ChangeArgs[0],
  identity = "remote",
  overrides = {},
) {
  const bytes = encodeWhiteboardLiveChanges(
    {
      roomName: "test-room",
      liveRoomName: state.room.name,
      generation: state.manifest.generation,
      sourceId: state.manifest.sourceId!,
      ...overrides,
    },
    elements,
  )[0];
  const handler = state.room.registerByteStreamHandler.mock.calls.at(-1)?.[1];
  expect(handler).toBeTypeOf("function");
  const reader = {
    info: { size: bytes.length },
    readAll: vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      return [bytes];
    }),
    async *[Symbol.asyncIterator]() {
      yield bytes;
    },
  };
  await act(async () => {
    handler(reader, { identity });
    await Promise.resolve();
    await Promise.resolve();
  });
  await flush(3);
  return reader;
}
async function attachCanvas() {
  let elements =
    (state.props.initialData as { elements: ChangeArgs[0] }).elements ?? [];
  const canvas = {
    updateScene: vi.fn(
      (update: Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]) => {
        if (update.elements) elements = update.elements as ChangeArgs[0];
      },
    ),
    addFiles: vi.fn(),
    getSceneElementsIncludingDeleted: () => elements,
    getAppState: () => ({}),
  };
  await act(async () => {
    (state.props.excalidrawAPI as (api: ExcalidrawImperativeAPI) => void)(
      canvas as unknown as ExcalidrawImperativeAPI,
    );
  });
  await flush(3);
  await flush(3);
  return canvas;
}

function canvasLifecycle() {
  const mounts = vi.fn();
  const unmounts = vi.fn();
  let current: {
    api: ExcalidrawImperativeAPI;
    draw: (elements: ChangeArgs[0]) => void;
    endStroke: (finalElements?: ChangeArgs[0], notify?: boolean) => void;
  };
  function Canvas(props: ExcalidrawProps) {
    const propsRef = useRef(props);
    const pointerUps = useRef(new Set<() => void>());
    propsRef.current = props;
    const [model] = useState(() => {
      const initial = props.initialData as {
        elements: ChangeArgs[0];
        files?: ChangeArgs[2];
      };
      return {
        elements: initial.elements,
        files: initial.files ?? {},
        appState: {
          activeTool: { type: "selection" },
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 },
        } as ChangeArgs[1],
      };
    });
    const emit = useCallback(
      () =>
        propsRef.current.onChange?.(
          model.elements,
          model.appState,
          model.files,
        ),
      [model],
    );
    const [api] = useState(() => ({
      updateScene: vi.fn(
        (update: Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]) => {
          if (update.elements)
            model.elements = update.elements as ChangeArgs[0];
          if (update.appState) Object.assign(model.appState, update.appState);
          emit();
        },
      ),
      addFiles: vi.fn((files: BinaryFileData[]) => {
        model.files = {
          ...model.files,
          ...Object.fromEntries(files.map((file) => [file.id, file])),
        };
        emit();
      }),
      getSceneElementsIncludingDeleted: () => model.elements,
      getSceneElements: () =>
        model.elements.filter((element) => !element.isDeleted),
      getFiles: () => model.files,
      getAppState: () => model.appState,
      onPointerUp: (callback: () => void) => {
        pointerUps.current.add(callback);
        return () => pointerUps.current.delete(callback);
      },
      setActiveTool: (tool: ChangeArgs[1]["activeTool"]) => {
        model.appState.activeTool = tool;
        emit();
      },
    }));
    useLayoutEffect(() => {
      const editorApi = api as unknown as ExcalidrawImperativeAPI;
      current = {
        api: editorApi,
        draw: (elements) => {
          model.elements = elements;
          emit();
        },
        endStroke: (finalElements, notify = true) => {
          pointerUps.current.forEach((callback) => callback());
          // Real Excalidraw finalizes freedraw AFTER its pointer-up emitter.
          if (finalElements) {
            model.elements = finalElements;
            if (notify) emit();
          }
        },
      };
      mounts(editorApi);
      propsRef.current.excalidrawAPI?.(editorApi);
      emit();
      return () => {
        unmounts(editorApi);
        // Excalidraw destroys its scene/files before the parent's passive cleanup.
        model.elements = [];
        model.files = {};
      };
    }, [api, emit, model]);
    return <div data-testid="mounted-whiteboard" />;
  }
  return { Canvas, mounts, unmounts, current: () => current };
}

async function incrementalSubscriptions() {
  const { useWhiteboardScene } = await vi.importActual<
    typeof import("@/hooks/use-whiteboard-scene")
  >("@/hooks/use-whiteboard-scene");
  state.sceneHook.mockImplementation(useWhiteboardScene);
  state.query.mockImplementation((ref, args) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    if (name.endsWith(":getSceneManifest")) return state.manifest;
    if (name.endsWith(":getSceneFiles"))
      return { fileRefs: state.scene?.fileRefs ?? {} };
    return state.scene;
  });
  state.queries.mockImplementation(() => state.buckets);
}

function receiveScene(elements: ChangeArgs[0], pendingBucket?: number) {
  state.scene = { ...cloudScene(elements), fileRefs: state.scene?.fileRefs };
  const buckets = new Map<number, ChangeArgs[0][number][]>();
  for (const element of elements) {
    const id = whiteboardBucketId(element.id);
    const bucket = buckets.get(id) ?? [];
    bucket.push(element);
    buckets.set(id, bucket);
  }
  state.manifest = { ...state.manifest, bucketIds: [...buckets.keys()] };
  state.buckets = Object.fromEntries(
    [...buckets].map(([id, elements]) => [
      String(id),
      id === pendingBucket
        ? undefined
        : {
            generation: state.manifest.generation,
            ...(state.manifest.sourceId
              ? { sourceId: state.manifest.sourceId }
              : {}),
            parts: splitWhiteboardPayload(JSON.stringify(elements)),
          },
    ]),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  // Keep real SHA-256 values but avoid native crypto I/O crossing fake-timer
  // test boundaries. Chrome coverage uses the actual Web Crypto implementation.
  vi.spyOn(crypto.subtle, "digest").mockImplementation(
    async (_, value) =>
      Uint8Array.from(
        createHash("sha256")
          .update(new Uint8Array(value as ArrayBuffer))
          .digest(),
      ).buffer,
  );
  vi.stubGlobal("indexedDB", undefined);
  state.props = {};
  state.Canvas = undefined;
  state.buckets = {};
  state.scene = null;
  state.recoveryError = undefined;
  state.permissions = {};
  state.audience = ["student"];
  state.room.localParticipant.metadata = undefined;
  state.room.remoteParticipants.clear();
  state.sceneHook.mockImplementation(() => ({
    scene:
      state.scene === undefined
        ? undefined
        : (state.scene ?? { elements: [], fileRefs: undefined }),
    manifest: state.manifest,
    error: state.recoveryError,
  }));
  state.room.name = "test-live-room";
  state.manifest = {
    format: 2,
    generation: 1,
    bucketIds: [],
    legacyOrder: [],
    fromLegacy: true,
  };
  state.save.mockResolvedValue({
    changed: true,
    generation: 1,
    conflictsParts: [],
  });
  state.previewStart.mockReset().mockResolvedValue(1);
  state.previewExport
    .mockReset()
    .mockResolvedValue(new Blob(["preview"], { type: "image/png" }));
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
});
afterEach(async () => {
  cleanup();
  await flush(1);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test.each([false, true])(
  "only writable live canvases expose the embedded course Board navigation, readonly=%s",
  async (readonly) => {
    render(
      <SharedWhiteboard
        roomName="test-room"
        courseId={"course-id" as Id<"classes">}
        isReadonly={readonly}
      />,
    );
    await flush(1);
    if (readonly) expect(state.props.renderTopRightUI).toBeUndefined();
    else {
      const control = state.props.renderTopRightUI?.(
        false,
        {} as Parameters<NonNullable<ExcalidrawProps["renderTopRightUI"]>>[1],
      );
      expect(control?.props).toMatchObject({
        title: "tab",
        onClick: expect.any(Function),
      });
    }
  },
);

test("presented notebook pages share drafts with the course editor and isolate late saves, images and full-storage reload", async () => {
  const pageA = "page-live-a" as Id<"courseNotebookPages">;
  const pageB = "page-live-b" as Id<"courseNotebookPages">;
  const file = imageFile();
  const image = imageElement(file);
  localStorage.setItem(
    `wb_notebook:${pageA}`,
    JSON.stringify({
      elements: [shape("pending-stroke"), image],
      files: { [file.id]: file },
      saved: false,
    }),
  );
  quota();
  downloaded(file);
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  state.scene = {
    ...cloudScene([shape("confirmed"), image]),
    fileRefs: { [file.id]: imageRef(file) },
  };
  state.manifest = {
    ...state.manifest,
    sourceId: "source-a",
    notebookPageId: pageA,
  };
  let release!: () => void;
  const savedArgs: { pageId: string }[] = [];
  let savedA = state.scene.elements;
  let held = false;
  state.save.mockImplementation(async (args) => {
    savedArgs.push(args);
    if (args.pageId === pageA && !held) {
      held = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    if (args.pageId === pageA)
      savedA = mergeWhiteboardElements(
        savedA,
        JSON.parse(joinWhiteboardPayload(args.parts)),
      );
    return { conflictsParts: [] };
  });
  const view = await mount();
  await flush(400);
  expect(savedArgs[0].pageId).toBe(pageA);
  expect(lifecycle.current().api.getFiles()[file.id]).toEqual(file);
  act(() =>
    lifecycle.current().draw([
      ...lifecycle.current().api.getSceneElementsIncludingDeleted(),
      {
        ...shape("late-local"),
        index: "a3" as ChangeArgs[0][number]["index"],
      },
    ]),
  );
  const aElements = lifecycle.current().api.getSceneElementsIncludingDeleted();
  state.scene = cloudScene([shape("page-b-only")]);
  state.manifest = {
    ...state.manifest,
    sourceId: "source-b",
    notebookPageId: pageB,
  };
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush(400);
  expect(
    lifecycle
      .current()
      .api.getSceneElementsIncludingDeleted()
      .map((element) => element.id),
  ).toEqual(["page-b-only"]);
  await act(async () => release());
  await flush(3100);
  expect(savedA.map((element) => element.id)).toEqual(
    expect.arrayContaining([
      "confirmed",
      "pending-stroke",
      "late-local",
      "image",
    ]),
  );
  expect(savedArgs.every((args) => args.pageId === pageA)).toBe(true);
  expect(state.previewExport).toHaveBeenCalledTimes(1);
  expect(state.previewStart).toHaveBeenCalledWith(
    expect.objectContaining({ pageId: pageA }),
  );
  // A full cache retains A's preceding draft; reopening merges it with cloud data.
  state.scene = {
    ...cloudScene(savedA),
    fileRefs: { [file.id]: imageRef(file) },
  };
  state.manifest = {
    ...state.manifest,
    sourceId: "source-a",
    notebookPageId: pageA,
  };
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush(400);
  expect(
    lifecycle
      .current()
      .api.getSceneElementsIncludingDeleted()
      .map((element) => element.id),
  ).toEqual(
    expect.arrayContaining([
      "confirmed",
      "pending-stroke",
      "late-local",
      "image",
    ]),
  );
  view.unmount();
  await flush(1);
  await mount("test-room", true);
  await flush(400);
  expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
    aElements,
  );
  expect(lifecycle.current().api.getFiles()[file.id]).toEqual(file);
  state.save.mockClear();
  act(() => lifecycle.current().draw([shape("student-cannot-edit")]));
  await flush(400);
  expect(state.save).not.toHaveBeenCalled();
});

test.each([false, true])(
  "notebook previews wait for delayed images and save replies, preserving full-storage drafts on reload (image first: %s)",
  async (imageFirst) => {
    const file = imageFile();
    const image = imageElement(file);
    const pending = shape("pending-stroke");
    localStorage.setItem(
      "wb_notebook:page-a",
      JSON.stringify({
        elements: [pending],
        files: {},
        saved: false,
      }),
    );
    quota();
    state.scene = {
      ...cloudScene([shape("confirmed"), image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    const fetcher = downloaded(file);
    const download = fetcher.getMockImplementation()!;
    let releaseImage!: () => void;
    fetcher.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      return download(...args);
    });
    cloudWrites();
    const save = state.save.getMockImplementation()!;
    let releaseSave!: () => void;
    state.save.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      return save(...args);
    });
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = render(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit
      />,
    );
    await flush(1);
    await flush(400);
    expect(releaseImage).toBeTypeOf("function");
    expect(releaseSave).toBeTypeOf("function");
    await act(async () => (imageFirst ? releaseImage() : releaseSave()));
    await flush(4000);
    expect(state.previewExport).not.toHaveBeenCalled();
    await act(async () => (imageFirst ? releaseSave() : releaseImage()));
    await flush(3100);
    expect(state.previewExport).not.toHaveBeenCalled();
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.previewStart).not.toHaveBeenCalled();
    // Repeated file notifications must not save or export the same revision again.
    act(() => lifecycle.current().api.addFiles([file]));
    await flush(4000);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.previewExport).not.toHaveBeenCalled();
    // Undo/redo remain versioned scene changes, not a replacement of the editor.
    const elements = lifecycle.current().api.getSceneElementsIncludingDeleted();
    act(() =>
      lifecycle
        .current()
        .draw(
          elements.map((element) =>
            element.id === pending.id
              ? { ...element, version: 2, versionNonce: 2, isDeleted: true }
              : element,
          ),
        ),
    );
    await flush(3400);
    expect(state.previewExport).not.toHaveBeenCalled();
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: pending.id, isDeleted: true }),
      ]),
    );
    act(() =>
      lifecycle
        .current()
        .draw(
          elements.map((element) =>
            element.id === pending.id
              ? { ...element, version: 3, versionNonce: 3 }
              : element,
          ),
        ),
    );
    await flush(3400);
    expect(state.previewExport).not.toHaveBeenCalled();
    view.unmount();
    await flush(1);
    expect(state.previewExport).toHaveBeenCalledTimes(1);
    const exported = state.previewExport.mock.calls[0][0];
    expect(exported.files[file.id]).toEqual(file);
    expect(exported.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pending.id,
          version: 3,
          isDeleted: false,
        }),
        image,
      ]),
    );
    const reopened = render(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit
      />,
    );
    await flush(1);
    await flush(400);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pending.id,
          version: 3,
          isDeleted: false,
        }),
        image,
      ]),
    );
    expect(lifecycle.current().api.getFiles()[file.id]).toEqual(file);
    reopened.rerender(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit={false}
      />,
    );
    await flush(1);
    state.save.mockClear();
    state.previewStart.mockClear();
    act(() => lifecycle.current().draw([shape("forbidden")]));
    await flush(4000);
    expect(state.save).not.toHaveBeenCalled();
    expect(state.previewStart).not.toHaveBeenCalled();
  },
);

test.each([false, true])(
  "closing before delayed images and saves finish retains the final snapshot with full storage, image first=%s",
  async (imageFirst) => {
    const file = imageFile();
    const image = imageElement(file);
    localStorage.setItem(
      "wb_notebook:page-a",
      JSON.stringify({
        elements: [shape("pending-stroke")],
        files: {},
        saved: false,
      }),
    );
    quota();
    state.scene = {
      ...cloudScene([shape("confirmed"), image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    const fetcher = downloaded(file);
    const download = fetcher.getMockImplementation()!;
    let releaseImage!: () => void;
    fetcher.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      return download(...args);
    });
    cloudWrites();
    const save = state.save.getMockImplementation()!;
    let releaseSave!: () => void;
    state.save.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      return save(...args);
    });
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = render(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit
      />,
    );
    await flush(1);
    await flush(400);
    expect(state.previewStart).not.toHaveBeenCalled();
    view.unmount();
    await flush(1);
    await act(async () => (imageFirst ? releaseImage() : releaseSave()));
    await flush(4000);
    expect(state.previewStart).not.toHaveBeenCalled();
    await act(async () => (imageFirst ? releaseSave() : releaseImage()));
    await flush(1);
    expect(state.previewExport).toHaveBeenCalledTimes(1);
    const snapshot = state.previewExport.mock.calls[0][0];
    expect(snapshot.files[file.id]).toEqual(file);
    expect(
      snapshot.elements.map((element: { id: string }) => element.id),
    ).toEqual(expect.arrayContaining(["confirmed", "pending-stroke", "image"]));
    expect(state.previewStart.mock.calls[0][0]).toMatchObject({
      pageId: "page-a",
      retireIfEmpty: false,
    });
    render(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit
      />,
    );
    await flush(1);
    await flush(400);
    expect(
      lifecycle
        .current()
        .api.getSceneElementsIncludingDeleted()
        .map((element) => element.id),
    ).toEqual(expect.arrayContaining(["confirmed", "pending-stroke", "image"]));
    expect(lifecycle.current().api.getFiles()[file.id]).toEqual(file);
  },
);

test.each([false, true])(
  "image download retry survives closing before/after the failure with full storage, failure after close=%s",
  async (afterClose) => {
    const file = imageFile();
    const image = imageElement(file);
    localStorage.setItem(
      "wb_notebook:page-a",
      JSON.stringify({
        elements: [shape("pending-stroke")],
        files: {},
        saved: false,
      }),
    );
    quota();
    state.scene = {
      ...cloudScene([shape("confirmed"), image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    const fetcher = downloaded(file);
    let release!: () => void;
    fetcher.mockImplementationOnce(async () => {
      if (afterClose)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return { ok: false } as Awaited<ReturnType<typeof fetcher>>;
    });
    cloudWrites();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = render(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit
      />,
    );
    await flush(1);
    await flush(400);
    view.unmount();
    if (afterClose) await act(async () => release());
    await flush(1100);
    expect(state.previewExport).toHaveBeenCalledTimes(1);
    const snapshot = state.previewExport.mock.calls[0][0];
    expect(snapshot.files[file.id]).toEqual(file);
    expect(
      snapshot.elements.map((element: { id: string }) => element.id),
    ).toEqual(expect.arrayContaining(["confirmed", "pending-stroke", "image"]));
    expect(state.previewStart.mock.calls[0][0]).toMatchObject({
      pageId: "page-a",
      retireIfEmpty: false,
    });
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/whiteboard-image"),
      ),
    ).toHaveLength(2);
    render(
      <NotebookPageEditor
        pageId={"page-a" as Id<"courseNotebookPages">}
        canEdit
      />,
    );
    await flush(1);
    await flush(400);
    expect(
      lifecycle
        .current()
        .api.getSceneElementsIncludingDeleted()
        .map((element) => element.id),
    ).toEqual(expect.arrayContaining(["confirmed", "pending-stroke", "image"]));
  },
);

test("closing drains pending image uploads and their retry before finalizing, preserving full-storage drafts", async () => {
  const files = [imageFile("file-a"), imageFile("file-b"), imageFile("file-c")];
  const images = files.map(
    (file, i) =>
      ({
        ...imageElement(file),
        id: `image-${i}`,
        index: `a${i + 2}`,
      }) as ChangeArgs[0][number],
  );
  const binaries = Object.fromEntries(files.map((file) => [file.id, file]));
  localStorage.setItem(
    "wb_notebook:page-a",
    JSON.stringify({
      elements: [shape("pending-stroke"), ...images],
      files: binaries,
      saved: false,
    }),
  );
  quota();
  state.scene = cloudScene([shape("confirmed")]);
  cloudWrites();
  const fetcher = downloaded();
  const fetch = fetcher.getMockImplementation()!;
  const attempts = new Map<string, number>();
  let releaseFailure!: () => void, releaseSuccess!: () => void;
  fetcher.mockImplementation(async (url, options) => {
    const parsed = String(url).startsWith("http")
      ? new URL(String(url))
      : undefined;
    const id = parsed?.searchParams.get("fileId");
    if (
      options?.method !== "POST" ||
      !id ||
      parsed?.searchParams.has("previewVersion")
    )
      return fetch(url, options);
    const attempt = (attempts.get(id) ?? 0) + 1;
    attempts.set(id, attempt);
    if (id === "file-a" && attempt === 1) {
      await new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      throw new Error("temporary upload failure");
    }
    if (id === "file-b" && attempt === 1)
      await new Promise<void>((resolve) => {
        releaseSuccess = resolve;
      });
    const file = files.find((file) => file.id === id)!;
    const ref = {
      ...imageRef(file),
      storageId: `storage-${id}` as Id<"_storage">,
    };
    state.scene = {
      ...state.scene!,
      fileRefs: { ...state.scene?.fileRefs, [id]: ref },
    };
    return { ok: true, blob: async () => new Blob(), json: async () => ref };
  });
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = render(
    <NotebookPageEditor
      pageId={"page-a" as Id<"courseNotebookPages">}
      canEdit
    />,
  );
  await flush(1);
  await flush(400);
  expect([...attempts.keys()]).toEqual(["file-a", "file-b"]);
  view.unmount();
  await act(async () => {
    releaseFailure();
    releaseSuccess();
  });
  await flush(1100);
  expect(Object.fromEntries(attempts)).toEqual({
    "file-a": 2,
    "file-b": 1,
    "file-c": 1,
  });
  expect(state.previewExport).toHaveBeenCalledTimes(1);
  expect(state.previewExport.mock.calls[0][0].files).toEqual(binaries);
  render(
    <NotebookPageEditor
      pageId={"page-a" as Id<"courseNotebookPages">}
      canEdit
    />,
  );
  await flush(1);
  await flush(400);
  expect(
    lifecycle
      .current()
      .api.getSceneElementsIncludingDeleted()
      .map((element) => element.id),
  ).toEqual(
    expect.arrayContaining([
      "pending-stroke",
      ...images.map((image) => image.id),
    ]),
  );
});

test.each(["offline", "PERMISSION_DENIED"])(
  "closed image uploads remain bounded and retain the pending binary: %s",
  async (message) => {
    const file = imageFile();
    const image = imageElement(file);
    const draft = {
      elements: [image],
      files: { [file.id]: file },
      saved: false,
    };
    localStorage.setItem("wb_notebook:bounded", JSON.stringify(draft));
    quota(true);
    const upload = vi.fn(async () => {
      throw new Error(message);
    });
    const saved = vi.fn(),
      closed = vi.fn();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = render(
      <WhiteboardEditor
        draftKey="notebook:bounded"
        scene={{ elements: [], fileRefs: {} }}
        fromLegacy={false}
        saveDelta={async () => ({ conflictsParts: [] })}
        uploadImage={upload}
        onSaved={saved}
        onClose={closed}
      />,
    );
    await flush(1);
    await flush(400);
    view.unmount();
    await flush(10_000);
    expect(upload).toHaveBeenCalledTimes(message === "offline" ? 3 : 1);
    expect(saved).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledWith(whiteboardSceneRevision([image]));
    expect(
      JSON.parse(localStorage.getItem("wb_notebook:bounded")!).files,
    ).toEqual(draft.files);
    await flush(10_000);
    expect(upload).toHaveBeenCalledTimes(message === "offline" ? 3 : 1);
  },
);

test("closing a reader cancels image retries rather than keeping preview work alive", async () => {
  const file = imageFile();
  state.scene = {
    ...cloudScene([imageElement(file)]),
    fileRefs: { [file.id]: imageRef(file) },
  };
  const fetcher = downloaded(file).mockRejectedValue(new Error("offline"));
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = await mount("test-room", true);
  await flush(1);
  view.unmount();
  await flush(10_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(state.previewStart).not.toHaveBeenCalled();
});

test("saved notifications wait for drawings and pending images, including full-storage drafts", async () => {
  const file = imageFile();
  const image = imageElement(file);
  const elements = [shape("pending-stroke"), image];
  localStorage.setItem(
    "wb_notebook:notify",
    JSON.stringify({ elements, files: { [file.id]: file }, saved: false }),
  );
  quota();
  let releaseImage!: (value: ReturnType<typeof imageRef>) => void;
  let releaseSave!: (value: { conflictsParts: string[] }) => void;
  const upload = vi.fn(
    () =>
      new Promise<ReturnType<typeof imageRef>>((resolve) => {
        releaseImage = resolve;
      }),
  );
  const save = vi
    .fn(
      async (): Promise<{ conflictsParts: string[] }> => ({
        conflictsParts: [],
      }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<{ conflictsParts: string[] }>((resolve) => {
          releaseSave = resolve;
        }),
    );
  const saved = vi.fn();
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  render(
    <WhiteboardEditor
      draftKey="notebook:notify"
      scene={{ elements: [], fileRefs: {} }}
      fromLegacy={false}
      saveDelta={save}
      uploadImage={upload}
      onSaved={saved}
    />,
  );
  await flush(1);
  await flush(400);
  expect(save).toHaveBeenCalled();
  expect(upload).toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  await act(async () => releaseSave({ conflictsParts: [] }));
  expect(saved).not.toHaveBeenCalled();
  await act(async () => releaseImage(imageRef(file)));
  await flush(10);
  expect(saved).toHaveBeenCalledExactlyOnceWith(
    whiteboardSceneRevision(
      lifecycle.current().api.getSceneElementsIncludingDeleted(),
    ),
    {
      elements: lifecycle.current().api.getSceneElementsIncludingDeleted(),
      files: lifecycle.current().api.getFiles(),
    },
  );
});

test.each([false, true])(
  "standalone editor preserves recovery, remote edits, images and undo/redo without live providers; full storage=%s",
  async (full) => {
    const file = imageFile();
    const image = imageElement(file);
    const pending = shape("pending-stroke");
    const key = "course-notebook:page-a";
    const draft = JSON.stringify({
      elements: [pending, image],
      files: { [file.id]: file },
      saved: false,
    });
    localStorage.setItem(`wb_${key}`, draft);
    if (full) quota();
    let scene: NonNullable<WhiteboardEditorProps["scene"]> = {
      elements: [shape("base")],
      fileRefs: {},
    };
    const saveDelta = vi.fn<WhiteboardEditorProps["saveDelta"]>(
      async (_bucket, parts) => {
        scene = {
          ...scene,
          elements: mergeWhiteboardElements(
            scene.elements,
            JSON.parse(joinWhiteboardPayload(parts)),
          ) as ChangeArgs[0],
        };
        return { conflictsParts: [] };
      },
    );
    const uploadImage = vi.fn(async () => {
      scene = { ...scene, fileRefs: { [file.id]: imageRef(file) } };
      return imageRef(file);
    });
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const editor = (isReadonly = false) => (
      <WhiteboardEditor
        draftKey={key}
        scene={scene}
        fromLegacy={false}
        saveDelta={saveDelta}
        uploadImage={uploadImage}
        isReadonly={isReadonly}
      />
    );
    const view = render(editor());
    await flush(1);
    await flush(400);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([pending, image, shape("base")]),
    );
    expect(uploadImage).toHaveBeenCalledExactlyOnceWith(file);
    const remote = shape("remote-stroke");
    scene = { ...scene, elements: [...scene.elements, remote] };
    const mounts = lifecycle.mounts.mock.calls.length;
    view.rerender(editor());
    await flush(5);
    expect(lifecycle.mounts).toHaveBeenCalledTimes(mounts);
    const local = shape("local-stroke");
    act(() => lifecycle.current().draw([...scene.elements, local]));
    await flush(100);
    for (const [version, isDeleted] of [
      [2, true],
      [3, false],
    ] as const) {
      act(() =>
        lifecycle
          .current()
          .draw([
            ...scene.elements.filter((element) => element.id !== local.id),
            { ...shape(local.id, version), isDeleted },
          ]),
      );
      act(() => lifecycle.current().endStroke());
      await flush(100);
    }
    expect(lifecycle.current().api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "NEVER" }),
    );
    act(() => window.dispatchEvent(new Event("pagehide")));
    await flush(100);
    view.unmount();
    await flush(1);
    const reload = render(editor());
    await flush(1);
    await flush(400);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([pending, image, remote, shape(local.id, 3)]),
    );
    expect(lifecycle.current().api.getFiles()).toMatchObject({
      [file.id]: file,
    });
    if (full) expect(localStorage.getItem(`wb_${key}`)).toBe(draft);
    reload.rerender(editor(true));
    await flush(10);
    saveDelta.mockClear();
    uploadImage.mockClear();
    act(() => lifecycle.current().draw([shape("forbidden")]));
    await flush(400);
    expect(state.props.viewModeEnabled).toBe(true);
    expect(saveDelta).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(state.roomContext).not.toHaveBeenCalled();
    expect(state.sceneHook).not.toHaveBeenCalled();
    expect(state.token).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  },
);

test("switching editor identity isolates delayed saves and images from the next page with full storage", async () => {
  const file = imageFile();
  const image = imageElement(file);
  const draft = JSON.stringify({
    elements: [shape("page-a"), image],
    files: { [file.id]: file },
    saved: false,
  });
  localStorage.setItem("wb_page-a", draft);
  localStorage.setItem(
    "wb_page-b",
    JSON.stringify({
      elements: [shape("page-b-pending")],
      files: {},
      saved: false,
    }),
  );
  quota();
  let releaseSave!: () => void;
  let releaseImage!: (value: ReturnType<typeof imageRef>) => void;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const pendingImage = new Promise<ReturnType<typeof imageRef>>((resolve) => {
    releaseImage = resolve;
  });
  const savedA: ChangeArgs[0][number][] = [];
  const saveA = vi.fn<WhiteboardEditorProps["saveDelta"]>(
    async (_bucket, parts) => {
      await pendingSave;
      savedA.push(...JSON.parse(joinWhiteboardPayload(parts)));
      return { conflictsParts: [] };
    },
  );
  const uploadA = vi.fn(() => pendingImage);
  const saveB = vi.fn<WhiteboardEditorProps["saveDelta"]>(async () => ({
    conflictsParts: [],
  }));
  const uploadB = vi.fn(async () => imageRef(file));
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = render(
    <WhiteboardEditor
      draftKey="page-a"
      scene={{ elements: [] }}
      fromLegacy={false}
      saveDelta={saveA}
      uploadImage={uploadA}
    />,
  );
  await flush(1);
  await flush(100);
  expect(saveA).toHaveBeenCalledTimes(1);
  expect(uploadA).toHaveBeenCalledTimes(1);
  view.rerender(
    <WhiteboardEditor
      draftKey="page-b"
      scene={{ elements: [shape("page-b-cloud")] }}
      fromLegacy={false}
      saveDelta={saveB}
      uploadImage={uploadB}
    />,
  );
  await flush(1);
  await flush(100);
  expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
    expect.arrayContaining([shape("page-b-cloud"), shape("page-b-pending")]),
  );
  await act(async () => {
    releaseSave();
    releaseImage(imageRef(file));
  });
  await flush(400);
  expect(savedA).toEqual(expect.arrayContaining([shape("page-a"), image]));
  expect(
    lifecycle
      .current()
      .api.getSceneElementsIncludingDeleted()
      .some((element) => element.id === "page-a" || element.id === image.id),
  ).toBe(false);
  expect(lifecycle.current().api.getFiles()).toEqual({});
  expect(uploadB).not.toHaveBeenCalled();
  expect(localStorage.getItem("wb_page-a")).toBe(draft);
  expect(state.roomContext).not.toHaveBeenCalled();
});

test("reload with full storage restores cloud drawings and sends only the new stroke", async () => {
  cloudWrites();
  quota();
  const original = [shape("original")];
  const first = await mount();
  change(original);
  await flush();
  first.unmount();
  await flush(1);
  await mount();
  expect(state.props.initialData).toMatchObject({ elements: original });
  change([...original, shape("new-stroke")]);
  await flush();
  expect(state.save).toHaveBeenLastCalledWith({
    roomName: "test-room",
    expectedLiveRoomName: "test-live-room",
    generation: 1,
    bucketId: whiteboardBucketId("new-stroke"),
    parts: splitWhiteboardPayload(JSON.stringify([shape("new-stroke")])),
  });
});
test("an obsolete local cache cannot undo a cloud clear", async () => {
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({ elements: [shape("deleted")], files: {} }),
  );
  state.scene = cloudScene([]);
  await mount();
  expect(state.props.initialData).toMatchObject({ elements: [] });
});
test("a pending draft with no cloud scene remains available", async () => {
  const draft = { elements: [shape("local")], files: {}, saved: false };
  localStorage.setItem("wb_test-room", JSON.stringify(draft));
  await mount();
  expect(state.props.initialData).toMatchObject(draft);
});
test.each([false, true])(
  "reload retains unconfirmed drawings but prefers cloud after confirmation saved=%s",
  async (saved) => {
    state.scene = cloudScene([shape("original")]);
    if (!saved) state.save.mockRejectedValue(new Error("offline"));
    const first = await mount();
    const edited = [shape("original"), shape("unsent")];
    change(edited);
    await flush();
    first.unmount();
    await flush(1);
    state.scene = cloudScene(saved ? [] : [shape("original")]);
    await mount();
    expect(state.props.initialData).toMatchObject({
      elements: saved ? [] : edited,
    });
  },
);
test("an old acknowledgement does not retire a newer cached draft", async () => {
  let acknowledge!: () => void;
  state.save.mockReturnValueOnce(
    new Promise((resolve) => {
      acknowledge = () =>
        resolve({ changed: true, generation: 1, conflictsParts: [] });
    }),
  );
  await mount();
  change([shape("old")]);
  await flush();
  const newer = { elements: [shape("newer")], files: {}, saved: false };
  localStorage.setItem("wb_test-room", JSON.stringify(newer));
  await act(async () => acknowledge());
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toEqual(newer);
});
test("the writer waits for cloud recovery and never saves an empty loading canvas", async () => {
  state.scene = undefined;
  const view = await mount();
  expect(state.props.onChange).toBeUndefined();
  expect(state.save).not.toHaveBeenCalled();
  state.scene = cloudScene([shape("restored")]);
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush(1);
  expect(state.props.initialData).toMatchObject({
    elements: [shape("restored")],
  });
});
test.each([
  { isReadonly: false, cached: false },
  { isReadonly: false, cached: true },
  { isReadonly: true, cached: false },
  { isReadonly: true, cached: true },
])(
  "images survive repeated reloads with full storage readonly=$isReadonly cached=$cached",
  async ({ isReadonly, cached }) => {
    const file = imageFile();
    const image = imageElement(file);
    const refs = { [file.id]: imageRef(file) };
    state.scene = { ...cloudScene([image]), fileRefs: refs };
    if (cached)
      localStorage.setItem(
        "wb_test-room",
        JSON.stringify({
          elements: [image],
          files: { [file.id]: file },
          fileRefs: refs,
          saved: true,
        }),
      );
    const fetcher = downloaded(file);
    quota();
    for (let i = 0; i < 2; i++) {
      const view = await mount("test-room", isReadonly);
      const canvas = await attachCanvas();
      if (cached)
        expect(state.props.initialData).toMatchObject({
          files: { [file.id]: file },
        });
      else
        expect(canvas.addFiles).toHaveBeenCalledWith([
          expect.objectContaining({ id: file.id, dataURL: file.dataURL }),
        ]);
      change([image], 0, { [file.id]: file });
      await flush();
      view.unmount();
      await flush(1);
    }
    expect(fetcher).toHaveBeenCalledTimes(cached ? 0 : 2);
    expect(state.otherMutation).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  },
);
test("live presentation retains trusted pointers and optional viewport following without updating a closed editor", async () => {
  state.scene = cloudScene([shape("base")]);
  const view = await mount("test-room", true);
  const canvas = await attachCanvas();
  canvas.updateScene.mockClear();
  const receive = state.room.on.mock.calls.find(
    ([event]) => event === "dataReceived",
  )![1];
  const participant = {
    identity: "teacher",
    name: "Teacher",
    metadata: JSON.stringify({ role: "teacher", isCompanion: true }),
  };
  const viewport = {
    type: "WHITEBOARD_VIEWPORT",
    scrollX: 42,
    scrollY: 24,
    zoom: 2,
  };
  const send = (message: object, sender = participant) =>
    act(() =>
      receive(new TextEncoder().encode(JSON.stringify(message)), sender),
    );
  send(viewport, {
    ...participant,
    metadata: JSON.stringify({ role: "student" }),
  });
  await flush(1);
  expect(canvas.updateScene).not.toHaveBeenCalled();
  send(viewport);
  await flush(1);
  expect(canvas.updateScene).toHaveBeenCalledWith({
    appState: { scrollX: 42, scrollY: 24, zoom: { value: 2 } },
  });
  send({
    type: "WHITEBOARD_POINTER",
    x: 10,
    y: 20,
    button: "down",
    tool: "laser",
  });
  expect(canvas.updateScene).toHaveBeenCalledWith({
    collaborators: expect.any(Map),
  });
  view.rerender(
    <SharedWhiteboard roomName="test-room" isReadonly followViewport={false} />,
  );
  canvas.updateScene.mockClear();
  send(viewport);
  await flush(1);
  expect(canvas.updateScene).not.toHaveBeenCalled();
  view.rerender(
    <SharedWhiteboard roomName="test-room" isReadonly followViewport />,
  );
  send(viewport);
  view.unmount();
  await flush(1);
  expect(canvas.updateScene).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.token).not.toHaveBeenCalled();
});

test("viewport-only updates neither save nor postpone a pending drawing", async () => {
  await mount();
  const elements = [shape("a")];
  change(elements);
  for (let i = 1; i <= 10; i++) {
    await flush(10);
    change(elements, i);
  }
  expect(state.save).toHaveBeenCalledTimes(1);
  await flush();
  const count = state.save.mock.calls.length;
  for (let i = 11; i <= 20; i++) change([...elements], i);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(count);
  expect(state.room.localParticipant.publishData).toHaveBeenCalled();
});
test("clearing sends tombstones and a later undo restores higher-version elements", async () => {
  cloudWrites();
  state.scene = cloudScene([shape("a")]);
  await mount();
  change([]);
  await flush();
  expect(
    JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
  ).toMatchObject([{ id: "a", isDeleted: true, version: 2 }]);
  change([shape("a", 3)]);
  await flush();
  expect(state.scene?.elements).toEqual([shape("a", 3)]);
});
test("unmount flushes the latest scene without consulting an unmounted canvas", async () => {
  const view = await mount();
  change([shape("last")]);
  view.unmount();
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
  ).toEqual([shape("last")]);
});
test("offline writes retry without requiring another edit", async () => {
  state.save.mockRejectedValueOnce(new Error("offline"));
  const view = await mount();
  change([shape("a")]);
  await flush();
  expect(view.getByRole("status").textContent).toContain(
    "whiteboardSaveFailed",
  );
  await flush(1000);
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(state.reportError).toHaveBeenCalledWith(
    expect.any(Error),
    expect.objectContaining({ operation: "whiteboard.scene_save" }),
  );
});
test("a full legacy quota retains pending images while retiring drawings superseded by cloud", async () => {
  const file = imageFile();
  const image = imageElement(file);
  const draft = { elements: [image], files: { [file.id]: file }, saved: false };
  localStorage.setItem("wb_test-room", JSON.stringify(draft));
  localStorage.setItem("unrelated-draft", "preserve");
  quota(true);
  cloudWrites();
  downloaded(file).mockImplementation(() => new Promise(() => {}));
  const view = await mount();
  const latest = [image, shape("confirmed")];
  change(latest, 0, draft.files);
  await flush();
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toMatchObject({
    saved: true,
    files: draft.files,
  });
  view.unmount();
  await flush(1);
  await mount();
  expect(state.props.initialData).toMatchObject({
    elements: latest,
    files: draft.files,
  });
  expect(localStorage.getItem("unrelated-draft")).toBe("preserve");
});
test.each(["scene", "image"] as const)(
  "pending images remain recoverable independently of confirmation order first=%s",
  async (first) => {
    const file = imageFile();
    const image = imageElement(file);
    const draft = {
      elements: [image],
      files: { [file.id]: file },
      saved: false,
    };
    localStorage.setItem("wb_test-room", JSON.stringify(draft));
    quota(true);
    const sceneRequests: Array<() => void> = [];
    const confirmScene = async () => {
      // Each bucket is a real independent write; release all sequential requests.
      for (let i = 0; i < 20; i++) {
        sceneRequests.shift()?.();
        await Promise.resolve();
      }
    };
    let confirmImage!: () => void;
    state.save.mockImplementation(
      (args) =>
        new Promise((resolve) => {
          sceneRequests.push(() => {
            state.scene = {
              ...cloudScene(
                mergeWhiteboardElements(
                  state.scene?.elements ?? [],
                  JSON.parse(joinWhiteboardPayload(args.parts)),
                ) as ChangeArgs[0],
              ),
              fileRefs: state.scene?.fileRefs,
            };
            resolve({ changed: true, generation: 1, conflictsParts: [] });
          });
        }),
    );
    downloaded(file).mockImplementation((_url, options) =>
      options?.method === "POST"
        ? new Promise((resolve) => {
            confirmImage = () =>
              resolve({
                ok: true,
                blob: async () => new Blob(),
                json: async () => imageRef(file),
              });
          })
        : Promise.resolve({
            ok: true,
            blob: async () => new Blob(),
            json: async () => ({}),
          }),
    );
    const view = await mount();
    change([image, shape("confirmed")], 0, draft.files);
    await flush();
    await act(async () => {
      if (first === "scene") await confirmScene();
      else confirmImage();
    });
    await flush(1);
    expect(JSON.parse(localStorage.getItem("wb_test-room")!).files).toEqual(
      draft.files,
    );
    await act(async () => {
      if (first === "scene") confirmImage();
      else await confirmScene();
    });
    await flush();
    expect(JSON.parse(localStorage.getItem("wb_test-room")!).files).toEqual(
      draft.files,
    );
    expect(state.scene?.elements).toEqual([image, shape("confirmed")]);
    view.unmount();
  },
);
test("reopening rejects a delayed real delta and full-storage reload preserves drawings, images and permissions", async () => {
  const { t, scheduleId } = await setupRecordingContext();
  const writer = t.withIdentity({ subject: "recording-leader-one" });
  const roomName = "recording-room";
  const key = `wb_${roomName}`;
  const lifecycle = () =>
    t.query(internal.schedule.getLiveLifecycleState, { roomName });
  const getScene = () =>
    writer.query(api.whiteboardSessions.getScene, { roomName });
  const oldRoom = (await lifecycle())!.liveRoomName;
  const file = imageFile();
  const ref = await storeWhiteboardImage(t, roomName, file.id, "saved-image");
  const image = imageElement(file);
  const original = [shape("cloud-original"), image];
  const pending = [...original, shape("pending-stroke")];
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName,
    expectedLiveRoomName: oldRoom,
    elements: original,
  });
  state.manifest = await writer.mutation(api.whiteboardSessions.ensureScene, {
    roomName,
    expectedLiveRoomName: oldRoom,
  });
  const draft = JSON.stringify({
    elements: pending,
    files: { [file.id]: file },
    fileRefs: { [file.id]: ref },
    saved: false,
  });
  localStorage.setItem(key, draft);
  quota();
  state.room.name = oldRoom;
  state.scene = await getScene();
  let release!: () => Promise<void>;
  state.save.mockImplementationOnce(
    (args) =>
      new Promise((resolve, reject) => {
        release = async () => {
          try {
            resolve(
              await writer.mutation(
                api.whiteboardSessions.applySceneDelta,
                args,
              ),
            );
          } catch (error) {
            reject(error);
          }
        };
      }),
  );
  const first = await mount(roomName);
  change(pending, 0, { [file.id]: file });
  await flush();
  expect(
    JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
  ).toEqual([shape("pending-stroke")]);
  const now = Date.now();
  await t.run((ctx) =>
    ctx.db.patch(scheduleId, {
      status: "completed",
      isLive: false,
      completedAt: now,
      sessionStartedAt: now - 1000,
      sessionReopenUntil: now + 60_000,
    }),
  );
  await writer.mutation(api.schedule.reopenLiveSession, { roomName });
  const newRoom = (await lifecycle())!.liveRoomName;
  expect(newRoom).not.toBe(oldRoom);
  await act(async () => release());
  expect(localStorage.getItem(key)).toBe(draft);
  expect(state.reportError).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining("STALE_LIVE_ACTIVATION"),
    }),
    expect.objectContaining({ operation: "whiteboard.scene_save" }),
  );
  expect(await getScene()).toMatchObject({
    elements: original,
    fileRefs: { [file.id]: ref },
  });
  first.unmount();
  await flush(1);
  state.room.name = newRoom;
  state.scene = await getScene();
  const view = await mount(roomName);
  expect(state.props.initialData).toMatchObject({
    elements: pending,
    files: { [file.id]: file },
  });
  state.save.mockImplementation((args) =>
    writer.mutation(api.whiteboardSessions.applySceneDelta, args),
  );
  change(pending, 0, { [file.id]: file });
  await flush();
  expect(await getScene()).toMatchObject({
    elements: pending,
    fileRefs: { [file.id]: ref },
  });
  expect(
    await t.run(async (ctx) => (await ctx.storage.get(ref.storageId))?.text()),
  ).toBe("saved-image");
  for (const caller of [
    t.withIdentity({ subject: "recording-leader-two" }),
    t,
  ]) {
    await expect(
      caller.query(api.whiteboardSessions.getScene, { roomName }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      caller.mutation(api.whiteboardSessions.applySceneDelta, {
        roomName,
        expectedLiveRoomName: newRoom,
        generation: state.manifest.generation,
        bucketId: whiteboardBucketId("unauthorized"),
        parts: splitWhiteboardPayload(JSON.stringify([shape("unauthorized")])),
      }),
    ).rejects.toThrow();
  }
  expect((await getScene())?.elements).toEqual(pending);
  view.unmount();
});

test.each(["constructor", "toString", "hasOwnProperty", "valueOf"])(
  "special image ID %s stays pending until authenticated upload and survives full-storage reload",
  async (fileId) => {
    const { t } = await setupRecordingContext();
    rateLimiter.register(t);
    const writer = t.withIdentity({ subject: "recording-leader-one" });
    const roomName = "recording-room";
    const key = `wb_${roomName}`;
    state.room.name = (await t.query(internal.schedule.getLiveLifecycleState, {
      roomName,
    }))!.liveRoomName;
    const normalFile = imageFile("normal-image");
    const normalRef = await storeWhiteboardImage(
      t,
      roomName,
      normalFile.id,
      "existing-image",
    );
    const normalImage = { ...imageElement(normalFile), id: "normal-element" };
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>';
    const file: BinaryFileData = {
      ...imageFile(fileId),
      dataURL:
        `data:image/svg+xml;base64,${btoa(svg)}` as BinaryFileData["dataURL"],
    };
    const pending = [
      shape("existing-drawing"),
      normalImage,
      shape("pending-stroke"),
      imageElement(file),
    ];
    const binaries = { [normalFile.id]: normalFile, [fileId]: file };
    await writer.mutation(api.whiteboardSessions.upsertScene, {
      roomName,
      expectedLiveRoomName: state.room.name,
      elements: pending.slice(0, 2),
    });
    state.manifest = await writer.mutation(api.whiteboardSessions.ensureScene, {
      roomName,
      expectedLiveRoomName: state.room.name,
    });
    state.scene = await writer.query(api.whiteboardSessions.getScene, {
      roomName,
    });
    state.save.mockImplementation((args) =>
      writer.mutation(api.whiteboardSessions.applySceneDelta, args),
    );
    localStorage.setItem(
      key,
      JSON.stringify({
        elements: pending,
        files: binaries,
        fileRefs: { [normalFile.id]: normalRef },
        saved: false,
      }),
    );
    quota(true);
    let releaseUpload!: () => Promise<void>;
    let postCount = 0;
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "https://example.com");
        if (url.pathname === "/whiteboard-files") {
          postCount += 1;
          expect(url.searchParams.get("fileId")).toBe(fileId);
          expect(init?.headers).toMatchObject({
            Authorization: "Bearer test-token",
          });
          return new Promise<Response>((resolve) => {
            releaseUpload = async () => {
              expect(await (init!.body as Blob).text()).toBe(svg);
              // Bridge the native fetch Blob and jsdom's Request body realm.
              const response = await writer.fetch(
                `${url.pathname}${url.search}`,
                {
                  ...init,
                  body: await (init!.body as Blob).arrayBuffer(),
                },
              );
              expect(response.status, await response.clone().text()).toBe(200);
              resolve(response);
            };
          });
        }
        if (url.pathname === "/api/whiteboard-image")
          return (async () => {
            const { fileRefs } = await writer.query(
              api.whiteboardSessions.getSceneFiles,
              { roomName },
            );
            const ref = Object.values(fileRefs).find(
              (ref) => ref.url === url.searchParams.get("url"),
            )!;
            const bytes = await t.run(async (ctx) =>
              (await ctx.storage.get(ref.storageId))!.arrayBuffer(),
            );
            return new Response(bytes, {
              headers: { "Content-Type": ref.mimeType },
            });
          })();
        return nativeFetch(input, init);
      }),
    );
    vi.stubGlobal(
      "FileReader",
      class {
        result = file.dataURL;
        onload?: () => void;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );
    const view = await mount(roomName);
    change(pending, 0, binaries);
    await flush();
    expect(postCount).toBe(1);
    const waiting = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(waiting);
    expect(waiting.defaultPrevented).toBe(true);
    const draft = await whiteboardDraftStorage.load(roomName);
    expect(draft).toMatchObject({ elements: pending, files: binaries });
    expect(Object.hasOwn(draft!.fileRefs!, fileId)).toBe(false);
    await act(async () => releaseUpload());
    await flush();
    const confirmed = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(confirmed);
    expect(confirmed.defaultPrevented).toBe(false);
    state.scene = await writer.query(api.whiteboardSessions.getScene, {
      roomName,
    });
    expect(Object.hasOwn(state.scene!.fileRefs!, fileId)).toBe(true);
    const ref = state.scene!.fileRefs![fileId];
    expect(
      await t.run(async (ctx) =>
        (await ctx.storage.get(ref.storageId))?.text(),
      ),
    ).toBe(svg);
    expect(
      await t.run(async (ctx) =>
        (await ctx.storage.get(normalRef.storageId))?.text(),
      ),
    ).toBe("existing-image");
    view.unmount();
    await flush(1);
    const reopened = await mount(roomName);
    expect(state.props.initialData).toMatchObject({
      elements: expect.arrayContaining(pending),
      files: binaries,
    });
    change(pending, 0, binaries);
    await flush();
    expect(postCount).toBe(1);
    expect(state.reportError).not.toHaveBeenCalled();
    const outsider = t.withIdentity({ subject: "recording-leader-two" });
    await expect(
      outsider.query(api.whiteboardSessions.getSceneFiles, { roomName }),
    ).rejects.toThrow("PERMISSION_DENIED");
    reopened.unmount();
  },
);

test.each([false, true])(
  "recovery and concurrent acknowledgements survive full-storage reload, reload pending=%s",
  async (reloadPending) => {
    const { useWhiteboardScene } = await vi.importActual<
      typeof import("@/hooks/use-whiteboard-scene")
    >("@/hooks/use-whiteboard-scene");
    const { t } = await setupRecordingContext();
    const writer = t.withIdentity({ subject: "recording-leader-one" });
    const roomName = "recording-room";
    const key = `wb_${roomName}`;
    const liveRoomName = (await t.query(
      internal.schedule.getLiveLifecycleState,
      { roomName },
    ))!.liveRoomName;
    state.room.name = liveRoomName;
    const file = imageFile();
    const ref = await storeWhiteboardImage(t, roomName, file.id, "image-bytes");
    const original = shape("cloud-original");
    const image = imageElement(file);
    const pending = [original, image, shape("pending-stroke")];
    await writer.mutation(api.whiteboardSessions.upsertScene, {
      roomName,
      expectedLiveRoomName: liveRoomName,
      elements: [original],
    });
    let fileResult: FunctionReturnType<
      typeof api.whiteboardSessions.getSceneFiles
    >;
    let buckets: Record<
      string,
      FunctionReturnType<typeof api.whiteboardSessions.getSceneBucket>
    > = {};
    const refresh = async (useCursors = false) => {
      const subscriptions = state.queries.mock.calls.at(-1)?.[0] as
        | Record<string, { args: { cursor?: WhiteboardBucketCursor } }>
        | undefined;
      state.manifest = (await writer.query(
        api.whiteboardSessions.getSceneManifest,
        { roomName },
      ))!;
      state.scene = await writer.query(api.whiteboardSessions.getScene, {
        roomName,
      });
      fileResult = await writer.query(api.whiteboardSessions.getSceneFiles, {
        roomName,
      });
      buckets = Object.fromEntries(
        await Promise.all(
          state.manifest.bucketIds.map(async (bucketId) => [
            String(bucketId),
            await writer.query(api.whiteboardSessions.getSceneBucket, {
              roomName,
              bucketId,
              ...(useCursors && subscriptions?.[String(bucketId)]?.args.cursor
                ? { cursor: subscriptions[String(bucketId)].args.cursor }
                : {}),
            }),
          ]),
        ),
      );
    };
    await refresh();
    state.sceneHook.mockImplementation(useWhiteboardScene);
    state.query.mockImplementation((ref, args) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(ref);
      if (name.endsWith(":getSceneManifest")) return state.manifest;
      return name.endsWith(":getSceneFiles") ? fileResult : state.scene;
    });
    state.queries.mockImplementation(() => buckets);
    state.otherMutation.mockRejectedValue(
      new Error("temporary initialization failure"),
    );
    const draft = JSON.stringify({
      elements: pending,
      files: { [file.id]: file },
      fileRefs: { [file.id]: ref },
      saved: false,
    });
    localStorage.setItem(key, draft);
    quota(true); // Both IDB and growing localStorage writes are unavailable.
    let view = await mount(roomName);
    expect(view.getByRole("alert").textContent).toBe(
      "whiteboardRecoveryFailed",
    );
    expect(state.save).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(draft);
    if (reloadPending) {
      view.unmount();
      await flush(1);
      view = await mount(roomName);
      expect(localStorage.getItem(key)).toBe(draft);
      expect(state.save).not.toHaveBeenCalled();
    }
    // A second browser initializes the scene successfully. Use the actual hook
    // and backend, not a mocked recoveryError flag, to recover this writer too.
    await writer.mutation(api.whiteboardSessions.ensureScene, {
      roomName,
      expectedLiveRoomName: liveRoomName,
    });
    await refresh();
    view.rerender(<SharedWhiteboard roomName={roomName} />);
    await flush(5);
    expect(view.queryByRole("alert")).toBeNull();
    expect(state.props.initialData).toMatchObject({
      elements: expect.arrayContaining(pending),
      files: { [file.id]: file },
    });
    const canvas = await attachCanvas();
    let acknowledge!: () => void;
    state.save.mockImplementation((args) =>
      writer.mutation(api.whiteboardSessions.applySceneDelta, args),
    );
    state.save.mockImplementationOnce(async (args) => {
      const response = await writer.mutation(
        api.whiteboardSessions.applySceneDelta,
        args,
      );
      return new Promise((resolve) => {
        acknowledge = () => resolve(response);
      });
    });
    change(canvas.getSceneElementsIncludingDeleted(), 0, { [file.id]: file });
    await flush(80);
    const peerId = Array.from(
      { length: 10000 },
      (_, i) => `other-tab-${i}`,
    ).find((id) => whiteboardBucketId(id) === whiteboardBucketId(original.id))!;
    const peer = { ...shape(peerId), index: "a3" };
    await writer.mutation(api.whiteboardSessions.applySceneDelta, {
      roomName,
      expectedLiveRoomName: liveRoomName,
      generation: state.manifest.generation,
      bucketId: whiteboardBucketId(peer.id),
      parts: splitWhiteboardPayload(JSON.stringify([peer])),
    });
    await refresh(true);
    const incremental = buckets[String(whiteboardBucketId(original.id))]!;
    expect(incremental.baseRevision).not.toBeNull();
    expect(
      JSON.parse(joinWhiteboardPayload(incremental.parts)).map(
        (element: { id: string }) => element.id,
      ),
    ).toContain(peer.id);
    expect(
      JSON.parse(joinWhiteboardPayload(incremental.parts)).map(
        (element: { id: string }) => element.id,
      ),
    ).not.toContain(original.id);
    view.rerender(<SharedWhiteboard roomName={roomName} />);
    await flush(3);
    const warning = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(warning);
    expect(warning.defaultPrevented).toBe(true);
    await act(async () => acknowledge());
    await flush();
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    expect(await whiteboardDraftStorage.load(roomName)).toMatchObject({
      saved: true,
      files: { [file.id]: file },
    });
    expect(canvas.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([...pending, peer]),
    );
    view.unmount();
    await flush(1);
    await refresh();
    view = await mount(roomName);
    expect(state.props.initialData).toMatchObject({
      elements: expect.arrayContaining([...pending, peer]),
      files: { [file.id]: file },
    });
    expect(
      await t.run(async (ctx) =>
        (await ctx.storage.get(ref.storageId))?.text(),
      ),
    ).toBe("image-bytes");
    const outsider = t.withIdentity({ subject: "recording-leader-two" });
    await expect(
      outsider.query(api.whiteboardSessions.getSceneManifest, { roomName }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      outsider.mutation(api.whiteboardSessions.applySceneDelta, {
        roomName,
        expectedLiveRoomName: liveRoomName,
        generation: state.manifest.generation,
        bucketId: whiteboardBucketId(peer.id),
        parts: splitWhiteboardPayload(JSON.stringify([peer])),
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    view.unmount();
  },
);

test.each([false, true])(
  "late editor startup reconciles remote edits with pending drawings and images across reload, readonly=%s",
  async (isReadonly) => {
    await incrementalSubscriptions();
    const first = shape("confirmed");
    const pending = shape("pending-stroke");
    const remote = {
      ...shape("remote-stroke"),
      index: "a3",
    } as ChangeArgs[0][number];
    const pendingFile = imageFile("pending-image");
    const remoteFile = imageFile("remote-image");
    const pendingImage = {
      ...imageElement(pendingFile),
      id: "local-image",
      index: "a2",
    } as ChangeArgs[0][number];
    const remoteImage = {
      ...imageElement(remoteFile),
      id: "remote-image",
      index: "a4",
    } as ChangeArgs[0][number];
    const draft = {
      elements: [first, pending, pendingImage],
      files: { [pendingFile.id]: pendingFile },
      saved: false,
    };
    localStorage.setItem("wb_test-room", JSON.stringify(draft));
    quota();
    let allowUpload!: () => void;
    const upload = new Promise<void>((resolve) => {
      allowUpload = resolve;
    });
    const fetcher = downloaded(remoteFile);
    fetcher.mockImplementation(async (_url, options) => {
      if (options?.method === "POST") await upload;
      return {
        ok: true,
        blob: async () =>
          new Blob(["remote-image"], { type: remoteFile.mimeType }),
        json: async () =>
          options?.method === "POST" ? imageRef(pendingFile) : {},
      };
    });
    receiveScene([first]);
    state.save.mockImplementation(async (args) => {
      receiveScene(
        mergeWhiteboardElements(
          state.scene!.elements,
          JSON.parse(joinWhiteboardPayload(args.parts)),
        ),
      );
      return {
        changed: true,
        generation: state.manifest.generation,
        conflictsParts: [],
      };
    });
    // Capture initialData, but keep the dynamically imported editor unavailable.
    let view = await mount("test-room", isReadonly);
    receiveScene([first, remote, remoteImage]);
    state.scene!.fileRefs = { [remoteFile.id]: imageRef(remoteFile) };
    view.rerender(
      <SharedWhiteboard roomName="test-room" isReadonly={isReadonly} />,
    );
    await flush(5);
    expect(state.save).not.toHaveBeenCalled();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    view.rerender(
      <SharedWhiteboard roomName="test-room" isReadonly={isReadonly} />,
    );
    await flush(5);
    const editor = lifecycle.current();
    // API readiness commits first; reconciliation then schedules its update.
    await flush(5);
    const expected = isReadonly
      ? [first, remote, remoteImage]
      : [first, pending, pendingImage, remote, remoteImage];
    expect(editor.api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining(expected),
    );
    expect(editor.api.getFiles()).toMatchObject({
      [remoteFile.id]: remoteFile,
    });
    expect(editor.api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "NEVER" }),
    );
    if (isReadonly) {
      expect(editor.api.getSceneElementsIncludingDeleted()).not.toEqual(
        expect.arrayContaining([pending, pendingImage]),
      );
      expect(state.save).not.toHaveBeenCalled();
      expect(
        fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
      ).toHaveLength(0);
    } else {
      expect(editor.api.getFiles()).toMatchObject(draft.files);
      act(() => editor.api.setActiveTool({ type: "freedraw" }));
      const next = {
        ...shape("after-startup"),
        index: "a5",
      } as ChangeArgs[0][number];
      act(() =>
        editor.draw([...editor.api.getSceneElementsIncludingDeleted(), next]),
      );
      expected.push(next);
      await flush(350);
      expect(editor.api.getAppState().activeTool.type).toBe("freedraw");
      expect(lifecycle.mounts).toHaveBeenCalledTimes(1);
      const sent = state.save.mock.calls.flatMap(([args]) =>
        JSON.parse(joinWhiteboardPayload(args.parts)),
      );
      expect(new Set(sent.map((element) => element.id))).toEqual(
        new Set([pending.id, pendingImage.id, next.id]),
      );
      expect(sent.some((element) => element.isDeleted)).toBe(false);
      const warning = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(warning);
      expect(warning.defaultPrevented).toBe(true);
      expect(fetcher).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    }
    await act(async () => allowUpload());
    await flush(5);
    if (!isReadonly) {
      state.scene!.fileRefs![pendingFile.id] = imageRef(pendingFile);
      const confirmed = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(confirmed);
      expect(confirmed.defaultPrevented).toBe(false);
    }
    view.unmount();
    await flush(1);
    // Storage is still full: keep the old draft, recover acknowledged drawings
    // from the cloud and retain the original pending image bytes on reload.
    expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toEqual(draft);
    view = await mount("test-room", isReadonly);
    await flush(5);
    await flush(5);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining(expected),
    );
    expect(lifecycle.current().api.getFiles()).toMatchObject({
      [remoteFile.id]: remoteFile,
    });
    if (!isReadonly)
      expect(lifecycle.current().api.getFiles()).toMatchObject(draft.files);
    view.unmount();
  },
);

test.each([false, true])(
  "incremental subscriptions retain the editor, pending strokes and images across full-storage reload, readonly=%s",
  async (isReadonly) => {
    await incrementalSubscriptions();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const first = shape("first-stroke");
    const second = shape("second-stroke");
    const third = shape("third-stroke");
    const file = imageFile();
    const image = imageElement(file);
    const original = [first, image];
    const draft = {
      elements: original,
      files: { [file.id]: file },
      fileRefs: { [file.id]: imageRef(file) },
      saved: false,
    };
    localStorage.setItem("wb_test-room", JSON.stringify(draft));
    quota();
    receiveScene(original);
    state.scene!.fileRefs = draft.fileRefs;
    expect(state.manifest.bucketIds).not.toContain(
      whiteboardBucketId(second.id),
    );
    const apply = (args: { parts: string[] }) => {
      receiveScene(
        mergeWhiteboardElements(
          state.scene!.elements,
          JSON.parse(joinWhiteboardPayload(args.parts)),
        ),
      );
      return {
        changed: true,
        generation: state.manifest.generation,
        conflictsParts: [],
      };
    };
    state.save.mockImplementation(async (args) => apply(args));
    let acknowledge!: () => void;
    state.save.mockImplementationOnce(async (args) => {
      const response = apply(args);
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      return response;
    });
    let view = await mount("test-room", isReadonly);
    await flush(5);
    const editor = lifecycle.current();
    act(() => {
      if (isReadonly) editor.api.updateScene({ appState: { scrollX: 42 } });
      else editor.api.setActiveTool({ type: "freedraw" });
    });
    if (!isReadonly) {
      act(() => editor.draw([...original, second]));
      await flush(80);
      expect(state.save).toHaveBeenCalledTimes(1);
    }
    // The manifest arrives before the newly subscribed bucket does.
    receiveScene([...original, second], whiteboardBucketId(second.id));
    view.rerender(
      <SharedWhiteboard roomName="test-room" isReadonly={isReadonly} />,
    );
    await flush(5);
    expect(view.queryByText("Loading whiteboard…")).toBeNull();
    expect(lifecycle.unmounts).not.toHaveBeenCalled();
    expect(lifecycle.current()).toBe(editor);
    if (!isReadonly) {
      act(() => editor.draw([...original, second, third]));
      await flush(350);
      expect(state.save).toHaveBeenCalledTimes(1);
      const pending = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(pending);
      expect(pending.defaultPrevented).toBe(true);
    }
    receiveScene([...original, second]);
    view.rerender(
      <SharedWhiteboard roomName="test-room" isReadonly={isReadonly} />,
    );
    await flush(5);
    expect(lifecycle.mounts).toHaveBeenCalledTimes(1);
    if (isReadonly) {
      expect(editor.api.getAppState().scrollX).toBe(42);
      expect(state.save).not.toHaveBeenCalled();
      receiveScene([...original, second, third]);
    } else {
      expect(editor.api.getAppState().activeTool.type).toBe("freedraw");
      expect(editor.api.getSceneElementsIncludingDeleted()).toEqual(
        expect.arrayContaining([...original, second, third]),
      );
      await act(async () => acknowledge());
      await flush(350);
      const sent = state.save.mock.calls.flatMap(([args]) =>
        JSON.parse(joinWhiteboardPayload(args.parts)),
      );
      expect(sent).toEqual(expect.arrayContaining([second, third]));
      expect(new Set(sent.map((element) => element.id))).toEqual(
        new Set([second.id, third.id]),
      );
      expect(sent.some((element) => element.isDeleted)).toBe(false);
    }
    view.rerender(
      <SharedWhiteboard roomName="test-room" isReadonly={isReadonly} />,
    );
    await flush(5);
    expect(editor.api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([...original, second, third]),
    );
    expect(editor.api.getFiles()).toEqual(draft.files);
    expect(editor.api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "NEVER" }),
    );
    // Neither storage can accept a new draft. Preserve the old one; recover
    // acknowledged strokes from Convex rather than resetting the editor to it.
    expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toEqual(draft);
    view.unmount();
    await flush(1);
    view = await mount("test-room", isReadonly);
    await flush(5);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([...original, second, third]),
    );
    expect(lifecycle.current().api.getFiles()).toEqual(draft.files);
    view.unmount();
  },
);

test("reports stalled readiness once without surviving unmount", async () => {
  const view = await mount();
  await flush(20_000);
  expect(state.reportError).toHaveBeenCalledTimes(1);
  expect(state.reportError.mock.calls[0][1].operation).toBe(
    "whiteboard.ready_timeout",
  );
  view.unmount();
  await flush(60_000);
  expect(state.reportError).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
  "StrictMode's discarded API cannot consume buffered images before the current API, readonly=%s",
  async (isReadonly) => {
    await incrementalSubscriptions();
    const first = shape("confirmed");
    const pending = shape("pending-stroke");
    const file = imageFile("strict-image");
    const image = imageElement(file);
    const draft = { elements: [first, pending], files: {}, saved: false };
    localStorage.setItem("wb_test-room", JSON.stringify(draft));
    quota();
    const fetcher = downloaded(file);
    receiveScene([first, image]);
    state.scene!.fileRefs = { [file.id]: imageRef(file) };
    cloudWrites();
    const lifecycle = canvasLifecycle();
    const ready = vi.fn(() => lifecycle.current().api.getFiles());
    const props = { roomName: "test-room", isReadonly, onReady: ready };
    let view = render(<SharedWhiteboard {...props} />);
    await flush(5);
    await flush(5);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const discarded = { addFiles: vi.fn(), updateScene: vi.fn() };
    // Model the SDK's two constructor callbacks before either deferred task runs.
    act(() => {
      state.props.excalidrawAPI?.(
        discarded as unknown as ExcalidrawImperativeAPI,
      );
      state.Canvas = lifecycle.Canvas;
      view.rerender(<SharedWhiteboard {...props} />);
    });
    await flush(5);
    await flush(5);
    expect(discarded.addFiles).not.toHaveBeenCalled();
    expect(discarded.updateScene).not.toHaveBeenCalled();
    const current = lifecycle.current().api;
    expect(current.addFiles).toHaveBeenCalledExactlyOnceWith([file]);
    expect(current.getFiles()).toEqual({ [file.id]: file });
    expect(current.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining(
        isReadonly ? [first, image] : [first, pending, image],
      ),
    );
    expect(current.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "NEVER" }),
    );
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready).toHaveReturnedWith({ [file.id]: file });
    await flush(350);
    if (isReadonly) {
      expect(state.save).not.toHaveBeenCalled();
      expect(state.token).not.toHaveBeenCalled();
    } else {
      expect(state.save).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
      ).toEqual([pending]);
    }
    expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toEqual(draft);
    view.unmount();
    await flush(1);
    receiveScene(state.scene!.elements);
    view = render(<SharedWhiteboard {...props} />);
    await flush(5);
    await flush(5);
    await flush(5);
    expect(lifecycle.current().api.getFiles()).toEqual({ [file.id]: file });
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining(
        isReadonly ? [first, image] : [first, pending, image],
      ),
    );
    view.unmount();
  },
);

test("live delivery precedes a delayed durable acknowledgement and never confirms a pending draft", async () => {
  enableLiveWriter();
  let acknowledge!: (value: unknown) => void;
  state.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  await mount();
  change([shape("pending")]);
  await flush(40);
  expect(state.room.localParticipant.sendBytes).toHaveBeenCalledTimes(1);
  expect(state.room.localParticipant.sendBytes.mock.calls[0][1]).toMatchObject({
    topic: WHITEBOARD_SCENE_TOPIC,
  });
  expect(state.save).not.toHaveBeenCalled();
  await flush(300);
  expect((await whiteboardDraftStorage.load("test-room"))?.saved).toBe(false);
  await flush(450);
  expect(state.save).toHaveBeenCalledTimes(1);
  change([shape("pending", 2)]);
  await flush(40);
  expect(state.room.localParticipant.sendBytes).toHaveBeenCalledTimes(2);
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  acknowledge({ conflictsParts: [] });
  await flush(1);
  expect((await whiteboardDraftStorage.load("test-room"))?.saved).toBe(false);
});

test("audience changes and reconnects keep one durable writer and recover pending images with full storage", async () => {
  enableLiveWriter();
  downloaded();
  const file = imageFile();
  const image = imageElement(file);
  const original = [shape("confirmed"), image];
  const pending = [...original, shape("pending-stroke")];
  const draft = JSON.stringify({
    elements: pending,
    files: { [file.id]: file },
    saved: false,
  });
  localStorage.setItem("wb_test-room", draft);
  quota();
  state.scene = {
    ...cloudScene(original),
    fileRefs: { [file.id]: imageRef(file) },
  };
  let release!: () => void;
  let active = 0;
  let maxActive = 0;
  const requests: (() => void)[] = [];
  state.save.mockImplementation(() => {
    maxActive = Math.max(maxActive, ++active);
    return new Promise((resolve) => {
      release = () => {
        active--;
        resolve({ conflictsParts: [] });
      };
      requests.push(release);
    });
  });
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = await mount();
  await flush(10);
  act(() => lifecycle.current().draw(pending));
  await flush(800);
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(state.room.localParticipant.sendBytes.mock.calls[0][1]).toMatchObject({
    destinationIdentities: ["student"],
  });
  state.audience = undefined;
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  const second = [...original, shape("pending-stroke", 2)];
  act(() => lifecycle.current().draw(second));
  await flush(1000);
  expect(state.save).toHaveBeenCalledTimes(1);
  state.audience = ["authorized", "EG_recorder"];
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  act(() =>
    lifecycle.current().draw([...original, shape("pending-stroke", 3)]),
  );
  await flush(40);
  expect(
    state.room.localParticipant.sendBytes.mock.calls.at(-1)?.[1],
  ).toMatchObject({ destinationIdentities: ["authorized", "EG_recorder"] });
  state.audience = [];
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  const sends = state.room.localParticipant.sendBytes.mock.calls.length;
  act(() =>
    lifecycle.current().draw([...original, shape("pending-stroke", 4)]),
  );
  await flush(40);
  expect(state.room.localParticipant.sendBytes).toHaveBeenCalledTimes(sends);
  expect(maxActive).toBe(1);
  expect(localStorage.getItem("wb_test-room")).toBe(draft);
  view.unmount();
  await act(async () => requests[0]());
  await flush(1);
  expect(maxActive).toBe(1);
  // Full quota must not retire an older pending draft before durable confirmation.
  expect(localStorage.getItem("wb_test-room")).toBe(draft);
  const reload = await mount();
  await flush(10);
  expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
    expect.arrayContaining(pending),
  );
  expect(lifecycle.current().api.getFiles()).toEqual({ [file.id]: file });
  reload.unmount();
  await act(async () => {
    for (const finish of requests.slice(1)) finish();
  });
});

test("live edits continue across a missing new bucket without acknowledging drafts or losing undo and images", async () => {
  enableLiveWriter();
  enableLiveWriter("remote");
  downloaded();
  const file = imageFile();
  const image = imageElement(file);
  const pending = shape("pending-stroke");
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({
      elements: [pending],
      files: { [file.id]: file },
      saved: false,
    }),
  );
  quota();
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  await incrementalSubscriptions();
  state.scene = {
    ...cloudScene([image]),
    fileRefs: { [file.id]: imageRef(file) },
  };
  receiveScene([image]);
  const view = await mount();
  await flush(10);
  await liveChanges([shape("remote-new", 2)]);
  receiveScene([image, shape("remote-new")], whiteboardBucketId("remote-new"));
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush(5);
  for (const [version, isDeleted] of [
    [3, false],
    [4, true],
    [5, false],
    [6, true],
  ] as const) {
    await liveChanges([{ ...shape("remote-new", version), isDeleted }]);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([
        pending,
        image,
        expect.objectContaining({ id: "remote-new", version, isDeleted }),
      ]),
    );
  }
  expect(lifecycle.current().api.getFiles()).toEqual({ [file.id]: file });
  expect((await whiteboardDraftStorage.load("test-room"))?.saved).toBe(false);
  expect(lifecycle.current().api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({ captureUpdate: "NEVER" }),
  );
  receiveScene([image, shape("remote-new")]);
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush(5);
  expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
    expect.arrayContaining([
      pending,
      expect.objectContaining({
        id: "remote-new",
        version: 6,
        isDeleted: true,
      }),
    ]),
  );
  state.permissions.remote = false;
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await liveChanges([shape("revoked")]);
  expect(
    lifecycle
      .current()
      .api.getSceneElementsIncludingDeleted()
      .some((element) => element.id === "revoked"),
  ).toBe(false);
  view.unmount();
});

test.each(["source", "generation", "activation"] as const)(
  "a retained live base cannot cross a new %s or a permission revocation",
  async (boundary) => {
    enableLiveWriter("remote");
    let durable: ChangeArgs[0] | undefined = [shape("base")];
    const { result, rerender } = renderHook(() =>
      useWhiteboardRealtime({
        room: state.room as unknown as Room,
        roomName: "test-room",
        sourceId: state.manifest.sourceId,
        generation: state.manifest.generation,
        durable,
        isReadonly: true,
      }),
    );
    await liveChanges([shape("base", 2)]);
    durable = undefined;
    rerender();
    await liveChanges([shape("base", 3)]);
    expect(result.current.elements).toEqual([shape("base", 3)]);
    state.permissions.remote = false;
    rerender();
    expect(result.current.elements).toBeUndefined();
    state.permissions.remote = true;
    if (boundary === "source") state.manifest.sourceId = "new-manifest";
    if (boundary === "generation") state.manifest.generation++;
    if (boundary === "activation") state.room.name = "new-activation";
    rerender();
    await liveChanges([shape("new-scope", 2)]);
    expect(result.current.elements).toBeUndefined();
    durable = [shape("new-scope")];
    rerender();
    expect(result.current.elements).toEqual([shape("new-scope", 2)]);
    expect(state.save).not.toHaveBeenCalled();
  },
);

test.each([false, true])(
  "a final local edit during remote apply survives undo, redo and reload; full storage=%s",
  async (full) => {
    enableLiveWriter();
    enableLiveWriter("remote");
    cloudWrites();
    downloaded();
    const file = imageFile();
    const image = imageElement(file);
    const pending = shape("pending-stroke");
    const draft = JSON.stringify({
      elements: [pending, image],
      files: { [file.id]: file },
      saved: false,
    });
    localStorage.setItem("wb_test-room", draft);
    if (full) quota();
    state.scene = {
      ...cloudScene([shape("base"), image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = await mount();
    await flush(800);
    const remote = shape("remote-final");
    const rejected = await liveChanges([shape("unauthorized")], "student");
    expect(rejected.readAll).toHaveBeenCalledExactlyOnceWith({
      signal: expect.objectContaining({ aborted: true }),
    });
    await liveChanges([remote]);
    state.scene = {
      ...state.scene,
      elements: [shape("base"), image, pending, remote],
    };
    view.rerender(<SharedWhiteboard roomName="test-room" />);
    // Run remote apply but not a later timer: local input must never be suppressed.
    await flush(0);
    const local = shape("local-final");
    act(() =>
      lifecycle.current().draw([shape("base"), image, pending, remote, local]),
    );
    window.dispatchEvent(new Event("pagehide"));
    await flush(1000);
    expect(state.scene?.elements).toEqual(
      expect.arrayContaining([pending, image, remote, local]),
    );
    expect(
      state.scene?.elements.some((element) => element.id === "unauthorized"),
    ).toBe(false);
    if (full) expect(localStorage.getItem("wb_test-room")).toBe(draft);
    else
      expect(
        (await whiteboardDraftStorage.load("test-room"))?.elements,
      ).toEqual(expect.arrayContaining([local]));
    for (const [version, isDeleted] of [
      [2, true],
      [3, false],
    ] as const) {
      act(() =>
        lifecycle
          .current()
          .draw([
            shape("base"),
            image,
            pending,
            remote,
            { ...shape(local.id, version), isDeleted },
          ]),
      );
      window.dispatchEvent(new Event("pagehide"));
      await flush(100);
    }
    expect(lifecycle.current().api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({ captureUpdate: "NEVER" }),
    );
    view.unmount();
    await flush(1);
    const reload = await mount();
    await flush(10);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([pending, image, remote, shape(local.id, 3)]),
    );
    expect(lifecycle.current().api.getFiles()).toMatchObject({
      [file.id]: file,
    });
    reload.unmount();
  },
);

test.each([false, true])(
  "short edits batch durable saves but retain live delivery, images and delayed recovery; full storage=%s",
  async (full) => {
    enableLiveWriter();
    downloaded();
    const file = imageFile();
    const image = imageElement(file);
    const pending = shape("pending-stroke");
    const draft = JSON.stringify({
      elements: [pending, image],
      files: { [file.id]: file },
      saved: false,
    });
    localStorage.setItem("wb_test-room", draft);
    if (full) quota();
    state.scene = {
      ...cloudScene([image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    cloudWrites();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = await mount();
    await flush(800);
    state.save.mockClear();
    state.room.localParticipant.sendBytes.mockClear();
    const apply = state.save.getMockImplementation()!;
    let acknowledge!: () => void;
    state.save.mockImplementationOnce(async (args) => {
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      return apply(args);
    });

    for (let version = 2; version <= 6; version++) {
      act(() => {
        lifecycle
          .current()
          .draw([image, shape(pending.id, version, version - 1)]);
        lifecycle.current().endStroke([image, shape(pending.id, version)]);
      });
      await flush(100);
    }
    expect(state.room.localParticipant.sendBytes).toHaveBeenCalledTimes(5);
    expect(state.save).not.toHaveBeenCalled();
    if (full) expect(localStorage.getItem("wb_test-room")).toBe(draft);
    else
      expect(
        (await whiteboardDraftStorage.load("test-room"))?.elements,
      ).toEqual(expect.arrayContaining([shape(pending.id, 6)]));
    await flush(250);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
    ).toEqual([shape(pending.id, 6)]);
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    act(() => {
      lifecycle.current().draw([image, shape(pending.id, 7)]);
      lifecycle.current().endStroke();
    });
    window.dispatchEvent(new Event("pagehide"));
    await flush(100);
    expect(state.save).toHaveBeenCalledTimes(1);
    await act(async () => acknowledge());
    await flush(0);
    expect(state.save).toHaveBeenCalledTimes(2);
    expect(state.scene?.elements).toEqual(
      expect.arrayContaining([image, shape(pending.id, 7)]),
    );
    if (full) expect(localStorage.getItem("wb_test-room")).toBe(draft);
    view.unmount();
    await flush(1);
    const reload = await mount();
    await flush(10);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([image, shape(pending.id, 7)]),
    );
    expect(lifecycle.current().api.getFiles()).toMatchObject({
      [file.id]: file,
    });
    reload.unmount();
  },
);

test("distinct short strokes retain every bucket while waiting for the shared durable window", async () => {
  enableLiveWriter();
  cloudWrites();
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = await mount();
  await flush(10);
  const strokes = Array.from({ length: 5 }, (_, index) =>
    shape(`stroke-${index}`),
  );
  const buckets = new Set(
    strokes.map((stroke) => whiteboardBucketId(stroke.id)),
  );
  expect(buckets.size).toBe(5);
  for (let index = 0; index < strokes.length; index++) {
    act(() => {
      lifecycle.current().draw(strokes.slice(0, index + 1));
      lifecycle.current().endStroke();
    });
    await flush(100);
  }
  expect(state.room.localParticipant.sendBytes).toHaveBeenCalledTimes(5);
  expect(state.save).not.toHaveBeenCalled();
  await flush(250);
  // One mutation per affected bucket, not one mutation per stroke or per whole scene.
  expect(state.save).toHaveBeenCalledTimes(buckets.size);
  expect(state.scene?.elements).toEqual(expect.arrayContaining(strokes));
  expect(
    state.save.mock.calls.flatMap(([args]) =>
      JSON.parse(joinWhiteboardPayload(args.parts)),
    ),
  ).toHaveLength(strokes.length);
  view.unmount();
});

test.each([
  [false, "task"],
  [true, "task"],
  [false, "pagehide"],
  [true, "pagehide"],
  [false, "hidden"],
  [true, "hidden"],
  [false, "unmount"],
  [true, "unmount"],
] as const)(
  "pointer-up reads the finalized API scene before onChange, retaining drafts and images on reload; full storage=%s, exit=%s",
  async (full, exit) => {
    enableLiveWriter();
    downloaded();
    const file = imageFile();
    const image = imageElement(file);
    const pending = shape("pending-stroke");
    const remote = shape("remote");
    localStorage.setItem(
      "wb_test-room",
      JSON.stringify({
        elements: [pending, image],
        files: { [file.id]: file },
        saved: false,
      }),
    );
    if (full) quota();
    state.scene = {
      ...cloudScene([remote, image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    cloudWrites();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = await mount();
    await flush(800);
    state.save.mockClear();
    state.room.localParticipant.sendBytes.mockClear();
    const snapshot = vi.spyOn(whiteboardDraftStorage, "save");
    const final = [image, remote, shape(pending.id, 3)];
    act(() => {
      lifecycle.current().draw([image, remote, shape(pending.id, 2)]);
      lifecycle.current().endStroke(final, false);
    });
    // No full-scene snapshot blocks Excalidraw's pointer-up finalization.
    expect(snapshot).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
    if (exit === "task") {
      await flush(1);
      expect(state.save).not.toHaveBeenCalled();
      if (!full)
        expect(
          (await whiteboardDraftStorage.load("test-room"))?.elements,
        ).toEqual(final);
    } else if (exit === "unmount") view.unmount();
    else if (exit === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      act(() => document.dispatchEvent(new Event("visibilitychange")));
    } else act(() => window.dispatchEvent(new Event("pagehide")));
    expect(snapshot).toHaveBeenLastCalledWith(
      "test-room",
      expect.objectContaining({ elements: final, saved: false }),
    );
    expect(state.room.localParticipant.sendBytes).toHaveBeenCalledTimes(1);
    if (exit === "task") window.dispatchEvent(new Event("pagehide"));
    await flush(1);
    expect(state.scene?.elements).toEqual(expect.arrayContaining(final));
    expect(state.save).toHaveBeenCalledTimes(1);
    if (exit !== "unmount") view.unmount();
    const reload = await mount();
    await flush(10);
    expect(lifecycle.current().api.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining(final),
    );
    expect(lifecycle.current().api.getFiles()).toMatchObject({
      [file.id]: file,
    });
    reload.unmount();
  },
);

test("losing the fast channel restores pointer-up durable delivery without replacing the pending writer", async () => {
  enableLiveWriter();
  cloudWrites();
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = await mount();
  await flush(10);
  act(() => lifecycle.current().draw([shape("pending")]));
  await flush(40);
  state.audience = undefined;
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  expect(state.save).not.toHaveBeenCalled();
  act(() => lifecycle.current().endStroke());
  await flush(1);
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(state.scene?.elements).toEqual([shape("pending")]);
  view.unmount();
});

test("beforeunload protects a final API revision not yet observed by onChange", async () => {
  enableLiveWriter();
  state.scene = cloudScene([shape("confirmed")]);
  cloudWrites();
  quota();
  const lifecycle = canvasLifecycle();
  state.Canvas = lifecycle.Canvas;
  const view = await mount();
  act(() => lifecycle.current().draw([shape("confirmed", 2)]));
  await flush(800);
  const saved = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
  act(() => lifecycle.current().endStroke([shape("confirmed", 3)], false));
  const pending = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  view.unmount();
  await flush(1);
  expect(state.scene?.elements).toEqual([shape("confirmed", 3)]);
});

test.each([false, true])(
  "an intentional empty scene still clears on immediate close and reload; full storage=%s",
  async (full) => {
    enableLiveWriter();
    downloaded();
    const file = imageFile();
    const image = imageElement(file);
    const drawing = shape("confirmed");
    localStorage.setItem(
      "wb_test-room",
      JSON.stringify({
        elements: [drawing, image],
        files: { [file.id]: file },
        saved: true,
      }),
    );
    if (full) quota();
    state.scene = {
      ...cloudScene([drawing, image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    cloudWrites();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = await mount();
    await flush(10);
    act(() => lifecycle.current().endStroke([], false));
    view.unmount();
    await flush(1);
    expect(state.scene?.elements).toHaveLength(2);
    expect(state.scene?.elements.every((element) => element.isDeleted)).toBe(
      true,
    );
    const reload = await mount();
    await flush(10);
    expect(
      lifecycle
        .current()
        .api.getSceneElementsIncludingDeleted()
        .filter((element) => !element.isDeleted),
    ).toEqual([]);
    reload.unmount();
  },
);

test.each(["pagehide", "hidden", "unmount"])(
  "%s flushes a batched stroke before its durable interval expires, with storage full",
  async (exit) => {
    enableLiveWriter();
    cloudWrites();
    quota();
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const view = await mount();
    await flush(10);
    act(() => {
      lifecycle.current().draw([shape("pending")]);
      lifecycle.current().endStroke();
    });
    await flush(40);
    expect(state.save).not.toHaveBeenCalled();
    if (exit === "unmount") view.unmount();
    else if (exit === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    } else window.dispatchEvent(new Event("pagehide"));
    await flush(1);
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.scene?.elements).toEqual([shape("pending")]);
    if (exit !== "unmount") view.unmount();
  },
);

test("continuous edits coalesce durable writes while keeping live delivery independent", async () => {
  enableLiveWriter();
  cloudWrites();
  await mount();
  for (let version = 1; version <= 50; version++) {
    change([shape("continuous", version)]);
    await flush(20);
  }
  expect(
    state.room.localParticipant.sendBytes.mock.calls.length,
  ).toBeGreaterThan(15);
  expect(state.save.mock.calls.length).toBeLessThanOrEqual(2);
  await flush(800);
  expect(state.scene?.elements).toEqual([shape("continuous", 50)]);
});

test("live changes and images survive older snapshots; deletion, undo and redo retain exact revisions", async () => {
  enableLiveWriter("remote");
  downloaded();
  const image = imageElement();
  state.scene = {
    ...cloudScene([shape("drawing"), image]),
    fileRefs: { "image-file": imageRef() },
  };
  const view = await mount("test-room", true);
  const canvas = await attachCanvas();
  const live = [shape("drawing", 3), { ...image, version: 2 }, shape("new")];
  await liveChanges(live);
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual(live);
  expect(canvas.addFiles).toHaveBeenCalled();
  state.scene = { ...state.scene, elements: [shape("drawing", 2), image] };
  view.rerender(<SharedWhiteboard roomName="test-room" isReadonly />);
  await flush(5);
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual(live);
  for (const [version, isDeleted] of [
    [4, true],
    [5, false],
    [6, true],
  ] as const) {
    await liveChanges([{ ...shape("drawing", version), isDeleted }]);
    expect(
      canvas
        .getSceneElementsIncludingDeleted()
        .find((element) => element.id === "drawing"),
    ).toMatchObject({ version, isDeleted });
  }
  expect(
    canvas.updateScene.mock.calls.every(
      ([update]) => update.captureUpdate === "NEVER",
    ),
  ).toBe(true);
  expect(state.save).not.toHaveBeenCalled();
  expect(state.room.localParticipant.sendBytes).not.toHaveBeenCalled();
});

test("concurrent live writers converge with durable conflicts without resurrecting a deletion", async () => {
  enableLiveWriter("writer-a");
  enableLiveWriter("writer-b");
  state.scene = cloudScene([shape("drawing")]);
  const view = await mount("test-room", true);
  const canvas = await attachCanvas();
  await liveChanges([shape("drawing", 2, 9)], "writer-a");
  await liveChanges([shape("drawing", 2, 3)], "writer-b");
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual([
    shape("drawing", 2, 3),
  ]);
  state.scene = cloudScene([shape("drawing", 2, 9)]);
  view.rerender(<SharedWhiteboard roomName="test-room" isReadonly />);
  await flush(5);
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual([
    shape("drawing", 2, 3),
  ]);
  await liveChanges([{ ...shape("drawing", 3), isDeleted: true }], "writer-a");
  await liveChanges([shape("drawing", 2, 1)], "writer-b");
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual([
    { ...shape("drawing", 3), isDeleted: true },
  ]);
  expect(state.save).not.toHaveBeenCalled();
});

test.each(["unauthorized", "oversized", "unknown-size", "overlap"] as const)(
  "cancel a rejected %s stream without blocking a valid writer or changing drawings",
  async (reason) => {
    enableLiveWriter("remote");
    state.scene = cloudScene([shape("cloud")]);
    await mount("test-room", true);
    const canvas = await attachCanvas();
    const handler = state.room.registerByteStreamHandler.mock.calls.at(-1)![1];
    let release = () => {};
    if (reason === "overlap") {
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const bytes = encodeWhiteboardLiveChanges(
        {
          roomName: "test-room",
          liveRoomName: state.room.name,
          sourceId: state.manifest.sourceId!,
          generation: 1,
        },
        [shape("first")],
      )[0];
      handler(
        {
          info: { size: bytes.length },
          async *[Symbol.asyncIterator]() {
            await pending;
            yield bytes;
          },
        },
        { identity: "remote" },
      );
    }
    const readAll = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      signal.throwIfAborted();
      throw new Error("Rejected streams must never be read into memory");
    });
    handler(
      {
        info: {
          size:
            reason === "unknown-size"
              ? undefined
              : reason === "oversized"
                ? MAX_WHITEBOARD_LIVE_BYTES + 1
                : 1,
        },
        readAll,
      },
      { identity: reason === "unauthorized" ? "student" : "remote" },
    );
    expect(readAll).toHaveBeenCalledExactlyOnceWith({
      signal: expect.objectContaining({ aborted: true }),
    });
    release();
    await flush(5);
    await liveChanges([shape("valid")]);
    expect(canvas.getSceneElementsIncludingDeleted()).toEqual(
      expect.arrayContaining([shape("cloud"), shape("valid")]),
    );
    expect(state.save).not.toHaveBeenCalled();
  },
);

test("an in-flight stream cannot apply after a generation change", async () => {
  enableLiveWriter("remote");
  state.scene = cloudScene([shape("cloud")]);
  const view = await mount("test-room", true);
  const canvas = await attachCanvas();
  const bytes = encodeWhiteboardLiveChanges(
    {
      roomName: "test-room",
      liveRoomName: state.room.name,
      sourceId: state.manifest.sourceId!,
      generation: 1,
    },
    [shape("obsolete")],
  )[0];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler = state.room.registerByteStreamHandler.mock.calls.at(-1)![1];
  handler(
    {
      info: { size: bytes.length },
      async *[Symbol.asyncIterator]() {
        await pending;
        yield bytes;
      },
    },
    { identity: "remote" },
  );
  state.manifest = { ...state.manifest, generation: 2 };
  view.rerender(<SharedWhiteboard roomName="test-room" isReadonly />);
  release();
  await flush(5);
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual([shape("cloud")]);
  await liveChanges([shape("current")]);
  expect(
    canvas.getSceneElementsIncludingDeleted().map((element) => element.id),
  ).toContain("current");
});

test("untrusted senders, revoked writers and stale scope cannot replace cloud drawings", async () => {
  enableLiveWriter("remote");
  state.scene = cloudScene([shape("cloud")]);
  const view = await mount("test-room", true);
  const canvas = await attachCanvas();
  await liveChanges([shape("forged")], "student");
  await liveChanges([shape("stale")], "remote", {
    liveRoomName: "old-activation",
  });
  await liveChanges([shape("stale")], "remote", { generation: 0 });
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual([shape("cloud")]);
  await liveChanges([shape("valid")]);
  expect(
    canvas.getSceneElementsIncludingDeleted().map((element) => element.id),
  ).toContain("valid");
  state.permissions.remote = false;
  view.rerender(<SharedWhiteboard roomName="test-room" isReadonly />);
  await flush(5);
  await liveChanges([shape("revoked")]);
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual([shape("cloud")]);
});

test("React StrictMode effect replay does not permanently close the sync controller", async () => {
  render(
    <StrictMode>
      <SharedWhiteboard roomName="test-room" />
    </StrictMode>,
  );
  await flush(1);
  change([shape("strict-mode-stroke")]);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
  ).toEqual([shape("strict-mode-stroke")]);
});

test("StrictMode re-registers live streams and both API callbacks preserve pending edits", async () => {
  enableLiveWriter();
  enableLiveWriter("remote");
  downloaded();
  const file = imageFile();
  const pending = shape("pending-stroke");
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({
      elements: [pending],
      files: { [file.id]: file },
      saved: false,
    }),
  );
  quota();
  state.scene = {
    ...cloudScene([imageElement(file)]),
    fileRefs: { [file.id]: imageRef(file) },
  };
  const view = render(
    <StrictMode>
      <SharedWhiteboard roomName="test-room" />
    </StrictMode>,
  );
  await flush(3);
  const discarded = { addFiles: vi.fn(), updateScene: vi.fn() };
  await liveChanges([shape("remote-new")]);
  act(() =>
    state.props.excalidrawAPI?.(
      discarded as unknown as ExcalidrawImperativeAPI,
    ),
  );
  const canvas = await attachCanvas();
  await liveChanges([shape("remote-new", 2)]);
  expect(discarded.updateScene).not.toHaveBeenCalled();
  expect(canvas.getSceneElementsIncludingDeleted()).toEqual(
    expect.arrayContaining([
      pending,
      imageElement(file),
      shape("remote-new", 2),
    ]),
  );
  expect(
    state.room.registerByteStreamHandler.mock.calls.length,
  ).toBeGreaterThanOrEqual(2);
  expect(state.room.unregisterByteStreamHandler).toHaveBeenCalled();
  view.unmount();
});

test("a newer cloud tombstone beats an old pending cache while preserving its image bytes", async () => {
  const file = imageFile();
  const original = imageElement(file);
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({
      elements: [original],
      files: { [file.id]: file },
      saved: false,
    }),
  );
  state.scene = cloudScene([
    { ...original, version: 2, versionNonce: 2, isDeleted: true },
  ]);
  quota();
  await mount();
  expect(state.props.initialData).toMatchObject({
    elements: [
      expect.objectContaining({ id: "image", isDeleted: true, version: 2 }),
    ],
    files: { [file.id]: file },
  });
});

test("a newly received cloud image is downloaded but not reuploaded by the writer", async () => {
  const fetcher = downloaded();
  state.scene = cloudScene([]);
  const view = await mount();
  await attachCanvas();
  const file = imageFile();
  const image = imageElement(file);
  state.scene = {
    ...cloudScene([image]),
    fileRefs: { [file.id]: imageRef(file) },
  };
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush();
  change([image], 0, { [file.id]: file });
  await flush();
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method !== "POST"),
  ).toHaveLength(1);
});

test.each([false, true])(
  "failed notebook images stop after three attempts despite later drawing updates, and a new storage reference recovers (readonly: %s)",
  async (isReadonly) => {
    const file = imageFile();
    const image = imageElement(file);
    quota();
    let scene = {
      ...cloudScene([image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    const fetcher = downloaded(file);
    const download = fetcher.getMockImplementation()!;
    fetcher.mockResolvedValue({ ok: false, status: 503 } as never);
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const editor = () => (
      <WhiteboardEditor
        draftKey="notebook:retry-budget"
        scene={scene}
        isReadonly={isReadonly}
        saveDelta={state.save}
        uploadImage={async () => imageRef(file)}
      />
    );
    const view = render(editor());
    await flush(1);
    await flush(4000);
    await flush(4000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (let version = 1; version <= 5; version++) {
      scene = {
        ...scene,
        elements: [image, shape("remote", version)],
        fileRefs: { [file.id]: imageRef(file) },
      };
      view.rerender(editor());
      await flush(1);
    }
    await flush(10_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockImplementation(download);
    scene = {
      ...scene,
      fileRefs: {
        [file.id]: {
          ...imageRef(file),
          storageId: "replacement" as Id<"_storage">,
        },
      },
    };
    view.rerender(editor());
    await flush(1);
    await flush(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(lifecycle.current().api.getFiles()[file.id]).toEqual(file);
    expect(
      lifecycle
        .current()
        .api.getSceneElementsIncludingDeleted()
        .map((e) => e.id),
    ).toEqual(["image", "remote"]);
  },
);

test.each([false, true])(
  "an obsolete image response cannot replace a new source or consume its retry budget (old fails: %s)",
  async (fails) => {
    const file = imageFile();
    const image = imageElement(file);
    let scene = {
      ...cloudScene([image]),
      fileRefs: { [file.id]: imageRef(file) },
    };
    const fetcher = downloaded(file);
    const download = fetcher.getMockImplementation()!;
    let release!: () => void;
    fetcher.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      if (fails) throw new Error("old image failed");
      return download(...args);
    });
    const lifecycle = canvasLifecycle();
    state.Canvas = lifecycle.Canvas;
    const editor = () => (
      <WhiteboardEditor
        draftKey="notebook:image-race"
        scene={scene}
        isReadonly
        saveDelta={state.save}
        uploadImage={async () => imageRef(file)}
      />
    );
    const view = render(editor());
    await flush(1);
    scene = {
      ...scene,
      fileRefs: {
        [file.id]: {
          ...imageRef(file),
          storageId: "replacement" as Id<"_storage">,
        },
      },
    };
    view.rerender(editor());
    await flush(1);
    await flush(1);
    expect(lifecycle.current().api.addFiles).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await flush(5000);
    expect(lifecycle.current().api.addFiles).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(lifecycle.current().api.getFiles()[file.id]).toEqual(file);
  },
);

test("a winning backend conflict replaces the rejected version before confirming the draft", async () => {
  state.scene = cloudScene([shape("a")]);
  const winner = shape("a", 3);
  state.save.mockResolvedValueOnce({
    changed: false,
    generation: 1,
    conflictsParts: splitWhiteboardPayload(JSON.stringify([winner])),
  });
  await mount();
  const canvas = await attachCanvas();
  const confirmation = vi.spyOn(whiteboardDraftStorage, "confirm");
  change([shape("a", 2)]);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(joinWhiteboardPayload(state.save.mock.calls[0][0].parts)),
  ).toEqual([shape("a", 2)]);
  expect(
    JSON.parse(joinWhiteboardPayload(state.save.mock.calls[1][0].parts)),
  ).toEqual([winner]);
  expect(canvas.updateScene).toHaveBeenCalledWith({
    elements: [winner],
    captureUpdate: "NEVER",
  });
  expect(
    confirmation.mock.calls.some(
      ([, revision]) => revision === whiteboardSceneRevision([shape("a", 2)]),
    ),
  ).toBe(false);
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toMatchObject({
    elements: [winner],
    saved: true,
  });
});

test("reader updates from cloud do not become local undo entries or writes", async () => {
  state.scene = cloudScene([shape("a")]);
  const view = await mount("test-room", true);
  const canvas = await attachCanvas();
  state.scene = cloudScene([shape("a", 2)]);
  view.rerender(<SharedWhiteboard roomName="test-room" isReadonly />);
  await flush();
  expect(canvas.updateScene).toHaveBeenCalledWith({
    elements: [shape("a", 2)],
    captureUpdate: "NEVER",
  });
  expect(state.save).not.toHaveBeenCalled();
});

test.each([false, true])(
  "unknown legacy draft is recovered only when no previous cloud scene existed fromLegacy=%s",
  async (fromLegacy) => {
    state.manifest = { ...state.manifest, fromLegacy };
    const oldDraft = { elements: [shape("legacy-unknown")], files: {} };
    localStorage.setItem("wb_test-room", JSON.stringify(oldDraft));
    state.scene = cloudScene([]);
    await mount();
    expect(state.props.initialData).toMatchObject({
      elements: fromLegacy ? [] : oldDraft.elements,
    });
  },
);

test("a delayed image upload from an unmounted writer cannot overwrite a newer pending draft", async () => {
  const file = imageFile();
  const image = imageElement(file);
  let finishOldUpload!: () => void;
  let postCount = 0;
  downloaded(file).mockImplementation((_url, options) => {
    if (options?.method !== "POST")
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(),
        json: async () => ({}),
      });
    postCount += 1;
    return new Promise((resolve) => {
      if (postCount === 1)
        finishOldUpload = () =>
          resolve({
            ok: true,
            blob: async () => new Blob(),
            json: async () => imageRef(file),
          });
    });
  });
  cloudWrites();
  const first = await mount();
  change([image], 0, { [file.id]: file });
  await flush();
  first.unmount();
  await flush(1);
  const second = await mount();
  state.save.mockRejectedValue(new Error("offline"));
  const newer = [image, shape("new-pending")];
  change(newer, 0, { [file.id]: file });
  await flush();
  expect(JSON.parse(localStorage.getItem("wb_test-room")!).elements).toEqual(
    newer,
  );
  await act(async () => finishOldUpload());
  await flush();
  expect(JSON.parse(localStorage.getItem("wb_test-room")!).elements).toEqual(
    newer,
  );
  second.unmount();
});

test.each(["drawing", "image"] as const)(
  "navigation warns only while %s is not acknowledged",
  async (kind) => {
    let acknowledge!: () => void;
    const file = imageFile();
    if (kind === "drawing")
      state.save.mockReturnValueOnce(
        new Promise((resolve) => {
          acknowledge = () =>
            resolve({ changed: true, generation: 1, conflictsParts: [] });
        }),
      );
    else
      downloaded(file).mockImplementation((_url, options) =>
        options?.method === "POST"
          ? new Promise((resolve) => {
              acknowledge = () =>
                resolve({
                  ok: true,
                  blob: async () => new Blob(),
                  json: async () => imageRef(file),
                });
            })
          : Promise.resolve({
              ok: true,
              blob: async () => new Blob(),
              json: async () => ({}),
            }),
      );
    await mount();
    change(
      kind === "drawing" ? [shape("pending")] : [imageElement(file)],
      0,
      kind === "drawing" ? files : { [file.id]: file },
    );
    await flush(80);
    const pending = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pending);
    expect(pending.defaultPrevented).toBe(true);
    await act(async () => acknowledge());
    await flush(1);
    const confirmed = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(confirmed);
    expect(confirmed.defaultPrevented).toBe(false);
  },
);

test("initial canvas objects cannot mutate the canonical cloud snapshot", async () => {
  state.scene = cloudScene([shape("a")]);
  await mount();
  const initial = state.props.initialData as { elements: ChangeArgs[0] };
  Object.assign(initial.elements[0], shape("a", 2));
  expect(state.scene.elements[0]).toEqual(shape("a"));
});

test("remote canvas objects cannot mutate the query cache before another bucket arrives", async () => {
  state.scene = cloudScene([shape("a")]);
  const view = await mount();
  let editor = (state.props.initialData as { elements: ChangeArgs[0] })
    .elements;
  const canvas = {
    getSceneElementsIncludingDeleted: () => editor,
    getAppState: () => ({}),
    updateScene: vi.fn((update: { elements?: ChangeArgs[0] }) => {
      if (update.elements) editor = update.elements;
    }),
    addFiles: vi.fn(),
  };
  await act(async () => {
    (state.props.excalidrawAPI as (api: ExcalidrawImperativeAPI) => void)(
      canvas as unknown as ExcalidrawImperativeAPI,
    );
  });
  await flush(3);
  state.scene = cloudScene([shape("a"), shape("b")]);
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush(3);
  const received = state.scene.elements.find((item) => item.id === "b");
  const edited = editor.find((item) => item.id === "b")!;
  Object.assign(edited, shape("b", 2));
  expect(received).toEqual(shape("b"));
  change(editor);
  state.scene = cloudScene([...state.scene.elements, shape("c")]);
  view.rerender(<SharedWhiteboard roomName="test-room" />);
  await flush();
  const transmitted = state.save.mock.calls.flatMap(([args]) =>
    JSON.parse(joinWhiteboardPayload(args.parts)),
  );
  expect(transmitted).toContainEqual(shape("b", 2));
});

test("a freehand stroke larger than 256 KiB reaches the real backend without losing existing drawings", async () => {
  const { t } = await setupRecordingContext();
  const writer = t.withIdentity({ subject: "recording-leader-one" });
  const roomName = "recording-room";
  const lifecycle = await t.query(internal.schedule.getLiveLifecycleState, {
    roomName,
  });
  state.room.name = lifecycle!.liveRoomName;
  const original = shape("original");
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName,
    expectedLiveRoomName: state.room.name,
    elements: [original],
  });
  state.manifest = await writer.mutation(api.whiteboardSessions.ensureScene, {
    roomName,
    expectedLiveRoomName: state.room.name,
  });
  state.scene = await writer.query(api.whiteboardSessions.getScene, {
    roomName,
  });
  state.save.mockImplementation((args) =>
    writer.mutation(api.whiteboardSessions.applySceneDelta, args),
  );
  const stroke = {
    ...shape("large-freehand"),
    type: "freedraw",
    points: Array.from({ length: 8192 }, (_, index) => [
      Math.sin(index) * 1000,
      Math.cos(index) * 1000,
    ]),
    pressures: Array.from({ length: 8192 }, (_, index) => index / 8192),
  } as ChangeArgs[0][number];
  expect(
    new TextEncoder().encode(JSON.stringify([stroke])).byteLength,
  ).toBeGreaterThan(256 * 1024);
  await mount(roomName);
  change([original, stroke]);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  const sent = state.save.mock.calls[0][0];
  expect(sent.parts.length).toBeGreaterThan(1);
  expect(JSON.parse(joinWhiteboardPayload(sent.parts))).toEqual([stroke]);
  const recovered = await writer.query(api.whiteboardSessions.getScene, {
    roomName,
  });
  expect(recovered?.elements).toEqual(
    expect.arrayContaining([original, stroke]),
  );
  expect(state.reportError).not.toHaveBeenCalled();
});

test("an explicit 8 MiB limit warns without deleting the previous draft or retrying permanently", async () => {
  const previous = { elements: [shape("previous")], files: {}, saved: false };
  localStorage.setItem("wb_test-room", JSON.stringify(previous));
  quota();
  const view = await mount();
  const oversized = {
    ...shape("oversized"),
    text: "x".repeat(8 * 1024 * 1024),
  } as ChangeArgs[0][number];
  change([oversized]);
  await flush();
  expect(state.save).not.toHaveBeenCalled();
  expect(view.getByRole("status").textContent).toBe("whiteboardSizeLimit");
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toEqual(previous);
  await flush(20_000);
  expect(state.save).not.toHaveBeenCalled();
});
