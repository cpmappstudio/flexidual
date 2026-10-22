import { act, cleanup, render } from "@testing-library/react";
import {
  StrictMode,
  useCallback,
  useEffect,
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
  },
  recoveryError: undefined as unknown,
  sceneHook: vi.fn(),
  Canvas: undefined as ComponentType<ExcalidrawProps> | undefined,
  buckets: {} as Record<string, unknown>,
  query: vi.fn(),
  queries: vi.fn(),
  save: vi.fn(),
  otherMutation: vi.fn(),
  reportError: vi.fn(),
  reportDiagnostic: vi.fn(),
  token: vi.fn(async () => "test-token"),
  room: {
    name: "test-live-room",
    state: "connected",
    on: vi.fn(),
    off: vi.fn(),
    localParticipant: { publishData: vi.fn() },
  },
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
  useRoomContext: () => state.room,
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: state.token }),
}));
vi.mock("@/hooks/use-whiteboard-scene", () => ({
  useWhiteboardScene: (...args: unknown[]) => state.sceneHook(...args),
}));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => state.query(...args),
  useQueries: (...args: unknown[]) => state.queries(...args),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "whiteboardSessions:applySceneDelta"
      ? state.save
      : state.otherMutation,
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
async function attachCanvas() {
  let elements =
    (state.props.initialData as { elements: ChangeArgs[0] }).elements ?? [];
  const canvas = {
    updateScene: vi.fn((update: { elements?: ChangeArgs[0] }) => {
      if (update.elements) elements = update.elements;
    }),
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
  };
  function Canvas(props: ExcalidrawProps) {
    const propsRef = useRef(props);
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
      getFiles: () => model.files,
      getAppState: () => model.appState,
      setActiveTool: (tool: ChangeArgs[1]["activeTool"]) => {
        model.appState.activeTool = tool;
        emit();
      },
    }));
    useEffect(() => {
      const editorApi = api as unknown as ExcalidrawImperativeAPI;
      current = {
        api: editorApi,
        draw: (elements) => {
          model.elements = elements;
          emit();
        },
      };
      mounts(editorApi);
      propsRef.current.excalidrawAPI?.(editorApi);
      emit();
      return () => {
        unmounts(editorApi);
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
            parts: splitWhiteboardPayload(JSON.stringify(elements)),
          },
    ]),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("indexedDB", undefined);
  state.props = {};
  state.Canvas = undefined;
  state.buckets = {};
  state.scene = null;
  state.recoveryError = undefined;
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
