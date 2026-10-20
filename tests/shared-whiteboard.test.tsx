import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { FunctionReturnType } from "convex/server";
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

vi.mock("@excalidraw/excalidraw/index.css", () => ({}));

const state = vi.hoisted(() => ({
  props: {} as ExcalidrawProps,
  scene: null as
    | FunctionReturnType<typeof api.whiteboardSessions.getScene>
    | undefined,
  query: vi.fn(),
  save: vi.fn(),
  otherMutation: vi.fn(),
  reportError: vi.fn(),
  reportDiagnostic: vi.fn(),
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
    return null;
  },
}));
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => state.room,
}));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    state.query(getFunctionName(ref), args);
    return args === "skip" ? undefined : state.scene;
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "whiteboardSessions:upsertScene"
      ? state.save
      : state.otherMutation,
}));

type ChangeArgs = Parameters<NonNullable<ExcalidrawProps["onChange"]>>;
const shape = (id: string, version = 1, versionNonce = 1) =>
  ({ id, version, versionNonce, isDeleted: false }) as ChangeArgs[0][number];
const files: ChangeArgs[2] = {};
function change(elements: ChangeArgs[0], scrollX = 0, sceneFiles = files) {
  act(() =>
    state.props.onChange?.(
      elements,
      {
        scrollX,
        scrollY: 0,
        zoom: { value: 1 },
      } as ChangeArgs[1],
      sceneFiles,
    ),
  );
}
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(80);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.props = {};
  state.scene = null;
  state.room.name = "test-live-room";
  state.save.mockResolvedValue(null);
  state.otherMutation.mockResolvedValue(null);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function cloudScene(elements: ChangeArgs[0]): NonNullable<typeof state.scene> {
  return {
    _id: "scene" as Id<"whiteboardSessions">,
    _creationTime: 0,
    roomName: "test-room",
    elements: [...elements],
    fileRefs: undefined,
    updatedAt: 1,
  };
}

function imageFile(id = "image-file"): BinaryFileData {
  return {
    id: id as BinaryFileData["id"],
    dataURL: "data:image/png;base64,aW1hZ2U=" as BinaryFileData["dataURL"],
    mimeType: "image/png",
    created: 1,
  };
}

function mockImageDownload(file = imageFile()) {
  const fetchImage = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["image"], { type: file.mimeType }),
    json: async () => ({ storageId: "uploaded-storage" }),
  }));
  vi.stubGlobal("fetch", fetchImage);
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
  return fetchImage;
}

test("reload with full storage restores cloud drawings before the next save", async () => {
  const elements = [shape("original")];
  state.save.mockImplementation(async (args) => {
    state.scene = cloudScene(args.elements);
    return null;
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const first = render(<SharedWhiteboard roomName="test-room" />);
  change(elements);
  await flush();
  first.unmount();
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({ elements });
  change([...elements, shape("new-stroke")]);
  await flush();
  expect(state.save).toHaveBeenLastCalledWith({
    roomName: "test-room",
    expectedLiveRoomName: "test-live-room",
    elements: [...elements, shape("new-stroke")],
  });
  expect(state.query).toHaveBeenLastCalledWith(
    "whiteboardSessions:getScene",
    "skip",
  );
});

test("an old local snapshot cannot undo a cloud clear on reload", () => {
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({ elements: [shape("deleted")], files: {} }),
  );
  state.scene = cloudScene([]);
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({ elements: [] });
});

test("a local draft is retained when no cloud scene exists", () => {
  const elements = [shape("local-draft")];
  localStorage.setItem("wb_test-room", JSON.stringify({ elements, files: {} }));
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({ elements });
});

test.each([false, true])(
  "reload retains unconfirmed edits but not obsolete confirmed cache, saved=%s",
  async (saved) => {
    const original = [shape("original")];
    const edited = [...original, shape("unsent-stroke")];
    state.scene = cloudScene(original);
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (!saved) state.save.mockRejectedValueOnce(new Error("offline"));
    const first = render(<SharedWhiteboard roomName="test-room" />);
    change(edited);
    await flush();
    first.unmount();
    state.scene = cloudScene(saved ? [] : original);
    render(<SharedWhiteboard roomName="test-room" />);
    expect(state.props.initialData).toMatchObject({
      elements: saved ? [] : edited,
    });
  },
);

test("an old save acknowledgement cannot replace a newer local draft", async () => {
  let acknowledge!: (value: null) => void;
  state.save.mockReturnValueOnce(
    new Promise<null>((resolve) => {
      acknowledge = resolve;
    }),
  );
  render(<SharedWhiteboard roomName="test-room" />);
  change([shape("old")]);
  await flush();
  const newerDraft = { elements: [shape("newer")], files: {}, saved: false };
  localStorage.setItem("wb_test-room", JSON.stringify(newerDraft));
  await act(async () => {
    acknowledge(null);
  });
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toEqual(newerDraft);
});

test("the writer does not mount or save an empty canvas while cloud recovery is pending", async () => {
  state.scene = undefined;
  const view = render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.onChange).toBeUndefined();
  await flush();
  expect(state.save).not.toHaveBeenCalled();
  state.scene = cloudScene([shape("restored")]);
  view.rerender(<SharedWhiteboard roomName="test-room" />);
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
  "images survive reload with full storage, readonly=$isReadonly, cached=$cached",
  async ({ isReadonly, cached }) => {
    const file = imageFile();
    const image = {
      ...shape("image"),
      type: "image",
      fileId: file.id,
      status: "saved",
      scale: [1, 1],
      crop: null,
    } as ChangeArgs[0][number];
    state.scene = {
      ...cloudScene([image]),
      fileRefs: {
        "image-file": {
          url: "https://example.convex.cloud/api/storage/image",
          mimeType: "image/png",
          storageId: "image-storage" as Id<"_storage">,
          created: 1,
        },
      },
    };
    if (cached)
      localStorage.setItem(
        "wb_test-room",
        JSON.stringify({
          elements: [image],
          files: { [file.id]: file },
          fileRefs: state.scene.fileRefs,
          saved: true,
        }),
      );
    const fetchImage = mockImageDownload();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const imageFiles = { [file.id]: file };
    for (let mount = 0; mount < 2; mount++) {
      const canvas = { updateScene: vi.fn(), addFiles: vi.fn() };
      const view = render(
        <SharedWhiteboard roomName="test-room" isReadonly={isReadonly} />,
      );
      await act(async () => {
        const onApi = state.props.excalidrawAPI as (
          api: ExcalidrawImperativeAPI,
        ) => void;
        onApi(canvas as unknown as ExcalidrawImperativeAPI);
        await vi.advanceTimersByTimeAsync(1);
      });
      if (cached)
        expect(state.props.initialData).toMatchObject({
          files: { [file.id]: file },
        });
      else
        expect(canvas.addFiles).toHaveBeenCalledWith([
          expect.objectContaining({
            id: file.id,
            dataURL: file.dataURL,
          }),
        ]);
      await act(async () => {
        state.props.onChange?.(
          [image],
          { scrollX: 0, scrollY: 0, zoom: { value: 1 } } as ChangeArgs[1],
          imageFiles,
        );
        vi.advanceTimersByTime(80);
      });
      view.unmount();
    }
    expect(fetchImage).toHaveBeenCalledTimes(cached ? 0 : 2);
    expect(state.otherMutation).not.toHaveBeenCalled();
    if (isReadonly) expect(state.save).not.toHaveBeenCalled();
    else
      expect(state.save).toHaveBeenCalledWith(
        expect.objectContaining({ elements: [image] }),
      );
  },
);

test("viewport and selection updates do not save or postpone a pending scene", async () => {
  render(<SharedWhiteboard roomName="test-room" />);
  const elements = [shape("a")];
  change(elements);
  const persist = vi.spyOn(Storage.prototype, "setItem");
  for (let i = 1; i <= 10; i++) {
    act(() => vi.advanceTimersByTime(10));
    change(elements, i);
  }
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(2);
  expect(state.room.localParticipant.publishData).toHaveBeenCalled();
  for (let i = 11; i <= 20; i++) change([...elements], i);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(persist).toHaveBeenCalledTimes(2);
});

test("element identity, nonce, order and clearing all preserve content changes", async () => {
  render(<SharedWhiteboard roomName="test-room" />);
  for (const elements of [
    [shape("a")],
    [shape("b")],
    [shape("b", 1, 2)],
    [shape("a"), shape("b")],
    [shape("b"), shape("a")],
    [],
  ]) {
    change(elements);
    await flush();
    expect(state.save).toHaveBeenLastCalledWith({
      roomName: "test-room",
      expectedLiveRoomName: "test-live-room",
      elements,
    });
  }
  expect(state.save).toHaveBeenCalledTimes(6);
});

test("unmount flushes the last snapshot instead of reading an unmounted canvas", async () => {
  const view = render(<SharedWhiteboard roomName="test-room" />);
  const elements = [shape("last-stroke")];
  change(elements);
  view.unmount();
  await flush();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(state.save).toHaveBeenCalledWith({
    roomName: "test-room",
    expectedLiveRoomName: "test-live-room",
    elements,
  });
});

test("a failed save can retry the same scene on the next change", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.save.mockRejectedValueOnce(new Error("offline"));
  render(<SharedWhiteboard roomName="test-room" />);
  const elements = [shape("a")];
  change(elements);
  await flush();
  change(elements);
  await flush();
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(state.reportError).toHaveBeenCalledWith(expect.any(Error), {
    operation: "whiteboard.scene_save",
    live_room: "test-live-room",
    connection_state: "connected",
  });
});

test("a stale pending cache cannot replace newer confirmed cloud drawings when storage fills", async () => {
  const draft = [shape("pending-old")];
  const latest = [...draft, shape("confirmed-new")];
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({ elements: draft, files: {}, saved: false }),
  );
  localStorage.setItem("unrelated-draft", "preserve");
  state.scene = cloudScene([]);
  state.save.mockImplementation(async (args) => {
    state.scene = cloudScene(args.elements);
    return null;
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const view = render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({ elements: draft });
  change(latest);
  await flush();
  expect(state.scene?.elements).toEqual(latest);
  view.unmount();
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({ elements: latest });
  change([...latest, shape("after-reload")]);
  await flush();
  expect(state.scene?.elements).toEqual([...latest, shape("after-reload")]);
  expect(localStorage.getItem("unrelated-draft")).toBe("preserve");
});

test("loading an image during a save does not leave confirmed drawings marked pending", async () => {
  mockImageDownload();
  let acknowledge!: (value: null) => void;
  const elements = [shape("confirmed")];
  const file = imageFile();
  state.scene = {
    ...cloudScene(elements),
    fileRefs: {
      [file.id]: {
        storageId: "storage" as Id<"_storage">,
        url: "https://example.com/image",
        mimeType: file.mimeType,
        created: 1,
      },
    },
  };
  state.save.mockReturnValueOnce(
    new Promise<null>((resolve) => {
      acknowledge = resolve;
    }),
  );
  const view = render(<SharedWhiteboard roomName="test-room" />);
  change(elements);
  await flush();
  change(elements, 0, { [file.id]: file });
  await act(async () => acknowledge(null));
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toMatchObject({
    saved: true,
    files: { [file.id]: file },
  });
  view.unmount();
  state.scene = cloudScene([]);
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({ elements: [] });
});

test("a full quota retains unuploaded images while retiring superseded drawing drafts", async () => {
  const file = imageFile();
  const sceneFiles = { [file.id]: file };
  const draft = [
    {
      ...shape("image"),
      type: "image",
      fileId: file.id,
    } as ChangeArgs[0][number],
  ];
  const latest = [...draft, shape("confirmed-new")];
  localStorage.setItem(
    "wb_test-room",
    JSON.stringify({ elements: draft, files: sceneFiles, saved: false }),
  );
  state.scene = cloudScene([]);
  // The image is still pending, independently of the acknowledged drawing save.
  state.otherMutation.mockReturnValue(new Promise(() => {}));
  state.save.mockImplementation(async (args) => {
    state.scene = cloudScene(args.elements);
    return null;
  });
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    const previous = this.getItem(key);
    if (!previous || value.length > previous.length)
      throw new DOMException("Full", "QuotaExceededError");
    write.call(this, key, value);
  });
  const view = render(<SharedWhiteboard roomName="test-room" />);
  change(latest, 0, sceneFiles);
  await flush();
  expect(JSON.parse(localStorage.getItem("wb_test-room")!)).toMatchObject({
    saved: true,
    files: sceneFiles,
  });
  view.unmount();
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject({
    elements: latest,
    files: sceneFiles,
  });
  change([...latest, shape("after-reload")], 0, sceneFiles);
  await flush();
  expect(state.scene?.elements).toEqual([...latest, shape("after-reload")]);
  expect(JSON.parse(localStorage.getItem("wb_test-room")!).files).toEqual(
    sceneFiles,
  );
});

test.each(["scene", "image"] as const)(
  "a pending image is never evicted before both cloud writes finish, first=%s",
  async (first) => {
    const file: BinaryFileData = {
      ...imageFile(),
      mimeType: "image/svg+xml",
      dataURL:
        "data:image/svg+xml;base64,PHN2Zy8+" as BinaryFileData["dataURL"],
    };
    mockImageDownload(file);
    const sceneFiles = { [file.id]: file };
    const image = {
      ...shape("image"),
      type: "image",
      fileId: file.id,
    } as ChangeArgs[0][number];
    const latest = [image, shape("confirmed-new")];
    const raw = JSON.stringify({
      elements: [image],
      files: sceneFiles,
      saved: false,
    });
    localStorage.setItem("wb_test-room", raw);
    state.scene = cloudScene([]);
    let confirmScene!: () => void;
    let confirmImage!: () => void;
    const fileRef = {
      storageId: "uploaded-storage" as Id<"_storage">,
      url: "https://example.com/image",
      mimeType: file.mimeType,
      created: 1,
    };
    state.save.mockImplementation(
      (args) =>
        new Promise<null>((resolve) => {
          confirmScene = () => {
            state.scene = {
              ...cloudScene(args.elements),
              fileRefs: state.scene?.fileRefs,
            };
            resolve(null);
          };
        }),
    );
    state.otherMutation.mockImplementation((args) => {
      if (!("storageId" in args))
        return Promise.resolve("https://example.com/upload");
      return new Promise((resolve) => {
        confirmImage = () => {
          state.scene = { ...state.scene!, fileRefs: { [file.id]: fileRef } };
          resolve(fileRef);
        };
      });
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const view = render(<SharedWhiteboard roomName="test-room" />);
    change(latest, 0, sceneFiles);
    await flush();
    await act(async () => {
      if (first === "scene") confirmScene();
      else confirmImage();
    });
    expect(localStorage.getItem("wb_test-room")).toBe(raw);
    await act(async () => {
      if (first === "scene") confirmImage();
      else confirmScene();
    });
    expect(localStorage.getItem("wb_test-room")).toBeNull();
    expect(state.scene).toMatchObject({
      elements: latest,
      fileRefs: { [file.id]: fileRef },
    });
    view.unmount();
    const canvas = { updateScene: vi.fn(), addFiles: vi.fn() };
    render(<SharedWhiteboard roomName="test-room" />);
    await act(async () => {
      (state.props.excalidrawAPI as (api: ExcalidrawImperativeAPI) => void)(
        canvas as unknown as ExcalidrawImperativeAPI,
      );
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(state.props.initialData).toMatchObject({ elements: latest });
    expect(canvas.addFiles).toHaveBeenCalledWith([
      expect.objectContaining({ id: file.id, dataURL: file.dataURL }),
    ]);
  },
);

test("a rejected save with full storage leaves the recoverable pending draft untouched", async () => {
  const file = imageFile();
  const draft = {
    elements: [shape("pending")],
    files: { [file.id]: file },
    saved: false,
  };
  const raw = JSON.stringify(draft);
  localStorage.setItem("wb_test-room", raw);
  state.scene = cloudScene([]);
  state.save.mockRejectedValue(new Error("offline"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const view = render(<SharedWhiteboard roomName="test-room" />);
  change(draft.elements);
  await flush();
  expect(localStorage.getItem("wb_test-room")).toBe(raw);
  view.unmount();
  render(<SharedWhiteboard roomName="test-room" />);
  expect(state.props.initialData).toMatchObject(draft);
});

test("reopening rejects a delayed real Convex save and reload preserves the pending draft with full storage", async () => {
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
  const image = {
    ...shape("image"),
    type: "image",
    fileId: file.id,
  } as ChangeArgs[0][number];
  const original = [shape("cloud-original"), image];
  const pending = [...original, shape("pending-stroke")];
  const sceneFiles = { [file.id]: file };
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName,
    expectedLiveRoomName: oldRoom,
    elements: original,
  });
  const draft = JSON.stringify({
    elements: pending,
    files: sceneFiles,
    fileRefs: { [file.id]: ref },
    saved: false,
  });
  localStorage.setItem(key, draft);
  state.room.name = oldRoom;
  state.scene = await getScene();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  let releaseSave!: () => Promise<void>;
  state.save.mockImplementationOnce(
    (args) =>
      new Promise<null>((resolve, reject) => {
        releaseSave = async () => {
          try {
            resolve(
              await writer.mutation(api.whiteboardSessions.upsertScene, args),
            );
          } catch (error) {
            reject(error);
          }
        };
      }),
  );
  const first = render(<SharedWhiteboard roomName={roomName} />);
  change(pending, 0, sceneFiles);
  await flush();
  // Seed a completed session; exercise the real public reopening mutation below.
  const now = Date.now();
  await t.run((ctx) =>
    ctx.db.patch(scheduleId, {
      status: "completed",
      isLive: false,
      completedAt: now,
      sessionStartedAt: now - 1_000,
      sessionReopenUntil: now + 60_000,
    }),
  );
  await writer.mutation(api.schedule.reopenLiveSession, { roomName });
  const newRoom = (await lifecycle())!.liveRoomName;
  expect(newRoom).not.toBe(oldRoom);
  await act(async () => releaseSave());
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
  state.room.name = newRoom;
  state.scene = await getScene();
  const reloaded = render(<SharedWhiteboard roomName={roomName} />);
  expect(state.props.initialData).toMatchObject({
    elements: pending,
    files: sceneFiles,
  });
  // The retained draft can be saved under the current activation after reloading.
  state.save.mockImplementation((args) =>
    writer.mutation(api.whiteboardSessions.upsertScene, args),
  );
  change(pending, 0, sceneFiles);
  await flush();
  expect(state.save).toHaveBeenLastCalledWith({
    roomName,
    expectedLiveRoomName: newRoom,
    elements: pending,
  });
  expect(await getScene()).toMatchObject({
    elements: pending,
    fileRefs: { [file.id]: ref },
  });
  expect(
    await t.run(async (ctx) => (await ctx.storage.get(ref.storageId))?.text()),
  ).toBe("saved-image");
  for (const [caller, error] of [
    [t.withIdentity({ subject: "recording-leader-two" }), "PERMISSION_DENIED"],
    [t, "User not authenticated"],
  ] as const) {
    await expect(
      caller.query(api.whiteboardSessions.getScene, { roomName }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      caller.mutation(api.whiteboardSessions.upsertScene, {
        roomName,
        expectedLiveRoomName: newRoom,
        elements: [],
      }),
    ).rejects.toThrow(error);
  }
  expect((await getScene())?.elements).toEqual(pending);
  expect(state.otherMutation).not.toHaveBeenCalled();
  reloaded.unmount();
  state.scene = await getScene();
  mockImageDownload(file);
  const canvas = { updateScene: vi.fn(), addFiles: vi.fn() };
  render(<SharedWhiteboard roomName={roomName} />);
  await act(async () => {
    (state.props.excalidrawAPI as (api: ExcalidrawImperativeAPI) => void)(
      canvas as unknown as ExcalidrawImperativeAPI,
    );
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(state.props.initialData).toMatchObject({ elements: pending });
  expect(canvas.addFiles).toHaveBeenCalledWith([
    expect.objectContaining({ id: file.id, dataURL: file.dataURL }),
  ]);
});

test("reports stalled readiness once, without logging strokes or surviving unmount", async () => {
  const view = render(<SharedWhiteboard roomName="test-room" />);
  expect(state.reportDiagnostic).toHaveBeenCalledWith({
    operation: "whiteboard.mount",
    live_room: "test-live-room",
    readonly: false,
  });
  await act(async () => vi.advanceTimersByTime(20_000));
  expect(state.reportError).toHaveBeenCalledTimes(1);
  expect(state.reportError.mock.calls[0][1].operation).toBe(
    "whiteboard.ready_timeout",
  );
  view.unmount();
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(state.reportError).toHaveBeenCalledTimes(1);
});
