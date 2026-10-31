import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { WhiteboardEditorProps } from "@/components/whiteboard/whiteboard-editor";
import { whiteboardSceneRevision } from "@/lib/whiteboard-draft-storage";

const state = vi.hoisted(() => ({
  props: {} as WhiteboardEditorProps,
  save: vi.fn(),
  begin: vi.fn(),
  token: vi.fn(),
  upload: vi.fn(),
  compress: vi.fn(),
  export: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/components/whiteboard/whiteboard-editor", () => ({
  WhiteboardEditor: (props: WhiteboardEditorProps) => {
    state.props = props;
    return null;
  },
}));
vi.mock("@/hooks/use-notebook-page-scene", () => ({
  useNotebookPageScene: () => ({
    manifest: { generation: 0 },
    scene: { elements: [], fileRefs: {} },
  }),
}));
vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref).endsWith(":beginPreview") ? state.begin : state.save,
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: state.token }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/whiteboard-image", () => ({
  compressWhiteboardImage: state.compress,
  uploadWhiteboardImage: state.upload,
}));
vi.mock("@excalidraw/excalidraw", () => ({ exportToBlob: state.export }));
vi.mock("@/lib/error-tracking", () => ({ reportRuntimeError: state.error }));
import { NotebookPageEditor } from "@/components/whiteboard/notebook-page-editor";
import { useNotebookPreview } from "@/hooks/use-notebook-preview";
const pageId = "page-a" as Id<"courseNotebookPages">;
type Elements = NonNullable<WhiteboardEditorProps["scene"]>["elements"];
const shape = (version = 1) =>
  ({
    id: "drawing",
    version,
    versionNonce: version,
    isDeleted: false,
    type: "rectangle",
    index: "a0",
  }) as Elements[number];
const previewBlob = new Blob(["preview"], { type: "image/png" });
function saved(elements: Elements, files = {}) {
  state.props.onSaved?.(whiteboardSceneRevision(elements), {
    elements: structuredClone(elements),
    files,
  });
}
function close(elements: Elements) {
  state.props.onClose?.(whiteboardSceneRevision(elements));
}
async function advance(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(crypto.subtle, "digest").mockImplementation(
    async (_, value) =>
      Uint8Array.from(
        createHash("sha256")
          .update(new Uint8Array(value as ArrayBuffer))
          .digest(),
      ).buffer,
  );
  state.begin.mockReset().mockResolvedValueOnce(1).mockResolvedValue(2);
  state.save.mockResolvedValue({
    generation: 0,
    changed: true,
    conflictsParts: [],
  });
  state.token.mockResolvedValue("token");
  state.compress.mockResolvedValue({
    blob: previewBlob,
    mimeType: "image/png",
  });
  state.upload.mockResolvedValue({
    storageId: "storage",
    url: "https://example.com/image",
    mimeType: "image/png",
    created: 1,
  });
  state.export.mockReset().mockResolvedValue(previewBlob);
});
afterEach(async () => {
  cleanup();
  await advance(10_000);
  await advance(10_000);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("page adapter delegates durable saving and authenticated images using only its own page", async () => {
  const renderTopRightUI = () => null;
  render(
    <NotebookPageEditor
      pageId={pageId}
      canEdit
      renderTopRightUI={renderTopRightUI}
    />,
  );
  expect(state.props.renderTopRightUI).toBe(renderTopRightUI);
  expect(state.props.draftKey).toBe("notebook:page-a");
  await state.props.saveDelta(1, ["delta"]);
  expect(state.save).toHaveBeenCalledExactlyOnceWith({
    pageId,
    bucketId: 1,
    parts: ["delta"],
    generation: 0,
  });
  const file = {
    id: "image-one",
    dataURL: "data:image/png;base64,A",
    mimeType: "image/png",
    created: 4,
  };
  await state.props.uploadImage(
    file as Parameters<WhiteboardEditorProps["uploadImage"]>[0],
  );
  expect(state.upload).toHaveBeenCalledExactlyOnceWith(
    previewBlob,
    "image/png",
    "token",
    { pageId, fileId: "image-one", created: "4" },
  );
  expect(state.export).not.toHaveBeenCalled();
});

test("StrictMode thumbnails wait for close and catch up with late confirmations", async () => {
  render(
    <StrictMode>
      <NotebookPageEditor pageId={pageId} canEdit />
    </StrictMode>,
  );
  let elements: Elements = [shape()];
  let release!: (blob: Blob) => void;
  state.export.mockImplementationOnce(
    () =>
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
  );
  saved(elements);
  await advance(30_000);
  expect(state.export).not.toHaveBeenCalled();
  close(elements);
  await advance();
  expect(state.export).toHaveBeenCalledTimes(1);
  elements = [shape(2)];
  close(elements);
  saved(elements);
  await act(async () => release(previewBlob));
  await advance(3000);
  expect(state.export).toHaveBeenCalledTimes(2);
  expect(state.export.mock.calls.at(-1)![0].elements).toEqual([shape(2)]);
  expect(state.upload.mock.calls.map((call) => call[3].previewVersion)).toEqual(
    ["2"],
  );
  expect(state.error).not.toHaveBeenCalled();
});

test("continuous saves do not generate thumbnails until close", async () => {
  render(<NotebookPageEditor pageId={pageId} canEdit />);
  let elements = [shape()];
  for (let version = 1; version <= 6; version++) {
    elements = [shape(version)];
    saved(elements);
    await state.props.saveDelta(1, [String(version)]);
    await advance(1000);
  }
  expect(state.save).toHaveBeenCalledTimes(6);
  expect(state.export).not.toHaveBeenCalled();
  await advance(30_000);
  expect(state.begin).not.toHaveBeenCalled();
  close(elements);
  await advance();
  expect(state.export).toHaveBeenCalledTimes(1);
  expect(state.export.mock.calls[0][0].elements).toEqual([shape(6)]);
});

test("callback identity changes do not flush early or repeat exports and use the latest authentication callback", async () => {
  let notify!: NonNullable<WhiteboardEditorProps["onSaved"]>;
  let closed!: NonNullable<WhiteboardEditorProps["onClose"]>;
  function Preview({ token }: { token: () => Promise<string | null> }) {
    const preview = useNotebookPreview(pageId, true, token);
    notify = preview.saved;
    closed = preview.closed;
    return null;
  }
  const firstToken = vi.fn(async () => "old-token");
  const latestToken = vi.fn(async () => "new-token");
  const view = render(
    <StrictMode>
      <Preview token={firstToken} />
    </StrictMode>,
  );
  notify(whiteboardSceneRevision([shape()]), {
    elements: [shape()],
    files: {},
  });
  await advance(1000);
  view.rerender(
    <StrictMode>
      <Preview token={latestToken} />
    </StrictMode>,
  );
  await advance(1999);
  expect(state.begin).not.toHaveBeenCalled();
  closed(whiteboardSceneRevision([shape()]));
  await advance();
  expect(firstToken).not.toHaveBeenCalled();
  expect(latestToken).toHaveBeenCalledTimes(1);
  expect(state.upload.mock.calls[0][2]).toBe("new-token");
  expect(state.export).toHaveBeenCalledTimes(1);
});

test("legacy metadata preparation is bounded and does not consume the upload retry budget", async () => {
  let prepared = 0;
  state.begin
    .mockReset()
    .mockImplementation(async () =>
      prepared++ < 64 ? { preparing: true } : 1,
    );
  render(<NotebookPageEditor pageId={pageId} canEdit />);
  state.upload.mockRejectedValueOnce(new Error("offline"));
  saved([shape()]);
  close([shape()]);
  await advance(3000);
  await advance(1000);
  expect(state.begin).toHaveBeenCalledTimes(66);
  expect(state.upload).toHaveBeenCalledTimes(2);
  expect(state.export).toHaveBeenCalledTimes(1);
  expect(state.begin.mock.calls.at(-1)![0].expectedVersion).toBe(1);
});

test("StrictMode effect replay and unmount without a final revision cannot retire a stale confirmed scene", async () => {
  let closed!: NonNullable<WhiteboardEditorProps["onClose"]>;
  function Preview() {
    const preview = useNotebookPreview(pageId, true, state.token);
    const { saved } = preview;
    closed = preview.closed;
    useEffect(() => {
      saved(whiteboardSceneRevision([shape()]), {
        elements: [shape()],
        files: {},
      });
    }, [saved]);
    return null;
  }
  const view = render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
  await advance(2999);
  expect(state.begin).not.toHaveBeenCalled();
  closed(whiteboardSceneRevision([shape()]));
  view.unmount();
  await advance();
  expect(state.upload).toHaveBeenCalledTimes(1);
  expect(state.export).toHaveBeenCalledTimes(1);
});

test("readonly users never generate previews; closing flushes a confirmed snapshot without a canvas API", async () => {
  const view = render(<NotebookPageEditor pageId={pageId} canEdit={false} />);
  const elements = [shape()];
  saved(elements);
  expect(state.props.isReadonly).toBe(true);
  await advance(4000);
  expect(state.begin).not.toHaveBeenCalled();
  view.unmount();
  const edit = render(<NotebookPageEditor pageId={pageId} canEdit />);
  saved(elements);
  close(elements);
  edit.unmount();
  await advance(4000);
  expect(state.begin).toHaveBeenCalledTimes(1);
  expect(state.upload).toHaveBeenCalledTimes(1);
});

test("closed thumbnails exclude erased drawings and images without removing undo/redo tombstones", async () => {
  render(<NotebookPageEditor pageId={pageId} canEdit />);
  const oldDrawing = { ...shape(), id: "old-Z-and-hola" };
  const image = {
    ...shape(),
    id: "image",
    type: "image",
    fileId: "file",
  } as Elements[number];
  const currentDrawing = { ...shape(), id: "hola-mundo" };
  const files = { file: { id: "file", dataURL: "data:image/png;base64,A" } };
  let elements: Elements = [oldDrawing, image];

  // Erase the old content, draw its replacement, undo, redo, then clear all.
  for (const visibleIds of [
    ["hola-mundo"],
    ["old-Z-and-hola", "image"],
    ["hola-mundo"],
    [],
  ]) {
    elements = [oldDrawing, image, currentDrawing].map((element) => ({
      ...element,
      version: element.version + state.export.mock.calls.length + 1,
      isDeleted: !visibleIds.includes(element.id),
    }));
    const snapshot = structuredClone(elements);
    saved(elements, files);
    close(elements);
    await advance(3000);
    const exported = state.export.mock.calls.at(-1)![0];
    expect(
      exported.elements.map((element: Elements[number]) => element.id),
    ).toEqual(visibleIds);
    expect(exported.files).toEqual(files);
    expect(elements).toEqual(snapshot);
    expect(elements).toHaveLength(3);
  }
  expect(state.export).toHaveBeenCalledTimes(4);
  expect(state.upload).toHaveBeenCalledTimes(4);
  expect(state.error).not.toHaveBeenCalled();
});

test("a transient upload retries its reservation and blob, including after closing the editor", async () => {
  const view = render(<NotebookPageEditor pageId={pageId} canEdit />);
  state.begin
    .mockReset()
    .mockImplementation(async ({ expectedVersion }) => expectedVersion ?? 1);
  state.upload.mockRejectedValueOnce(new Error("offline"));
  saved([shape()]);
  close([shape()]);
  view.unmount();
  await advance();
  expect(state.upload).toHaveBeenCalledTimes(1);
  expect(state.export).toHaveBeenCalledTimes(1);
  await advance(1000);
  expect(state.upload).toHaveBeenCalledTimes(2);
  expect(state.export).toHaveBeenCalledTimes(1);
  expect(state.begin.mock.calls[1][0]).toEqual({
    pageId,
    revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    expectedVersion: 1,
    retireIfEmpty: false,
  });
  expect(state.upload.mock.calls.map((call) => call[3].previewVersion)).toEqual(
    ["1", "1"],
  );
  await advance(10_000);
  expect(state.upload).toHaveBeenCalledTimes(2);
});

test("lost upload responses and reopening unchanged pages do not export or upload again", async () => {
  const view = render(<NotebookPageEditor pageId={pageId} canEdit />);
  state.upload.mockImplementationOnce(async () => {
    // The server completed the upload, but its response was lost.
    state.begin.mockResolvedValue(null);
    throw new Error("network response lost");
  });
  saved([shape()]);
  close([shape()]);
  await advance(3000);
  await advance(1000);
  expect(state.export).toHaveBeenCalledTimes(1);
  expect(state.upload).toHaveBeenCalledTimes(1);
  view.unmount();
  render(<NotebookPageEditor pageId={pageId} canEdit />);
  saved([shape()]);
  close([shape()]);
  await advance(3000);
  expect(state.begin).toHaveBeenCalledTimes(3);
  expect(state.export).toHaveBeenCalledTimes(1);
  expect(state.upload).toHaveBeenCalledTimes(1);
});

test("a late confirmation retains its own page and images after unmount and page switching", async () => {
  const view = render(<NotebookPageEditor pageId={pageId} canEdit />);
  const lateSaved = state.props.onSaved!;
  const image = {
    ...shape(),
    type: "image",
    fileId: "file-a",
  } as Elements[number];
  const file = {
    id: "file-a",
    dataURL: "data:image/png;base64,A",
    mimeType: "image/png",
    created: 1,
  } as BinaryFileData;
  const files = { [file.id]: file };
  close([image]);
  view.unmount();
  render(<NotebookPageEditor pageId={"page-b" as typeof pageId} canEdit />);
  lateSaved(whiteboardSceneRevision([image]), {
    elements: [image],
    files,
  });
  saved([shape(2)]);
  await advance();
  expect(state.export.mock.calls[0][0].files).toEqual(files);
  expect(state.upload.mock.calls[0][3].pageId).toBe(pageId);
  close([shape(2)]);
  await advance(3000);
  expect(state.upload.mock.calls.map((call) => call[3].pageId)).toEqual([
    pageId,
    "page-b",
  ]);
});

test("retries are bounded even on close, while permission and obsolete-reservation failures never retry", async () => {
  const view = render(<NotebookPageEditor pageId={pageId} canEdit />);
  state.begin
    .mockReset()
    .mockImplementation(async ({ expectedVersion }) => expectedVersion ?? 1);
  state.upload.mockRejectedValue(new Error("offline"));
  saved([shape()]);
  close([shape()]);
  await advance(3000);
  await advance(1000);
  await advance(2000);
  view.unmount();
  await advance(30_000);
  expect(state.upload).toHaveBeenCalledTimes(3);
  expect(state.export).toHaveBeenCalledTimes(1);
  for (const message of [
    "PERMISSION_DENIED",
    "STALE_NOTEBOOK_PREVIEW",
    "ArgumentValidationError: Object contains extra field `retireIfEmpty` that is not in the validator.",
  ]) {
    state.begin.mockClear().mockRejectedValue(new Error(message));
    const next = render(<NotebookPageEditor pageId={pageId} canEdit />);
    saved([shape(3)]);
    close([shape(3)]);
    await advance(3000);
    next.unmount();
    await advance(30_000);
    expect(state.begin).toHaveBeenCalledTimes(1);
  }
});

test("a close with pending edits never finalizes the previous empty confirmation", async () => {
  const view = render(<NotebookPageEditor pageId={pageId} canEdit />);
  saved([]);
  const lateSaved = state.props.onSaved!;
  close([shape()]);
  view.unmount();
  await advance(10_000);
  expect(state.begin).not.toHaveBeenCalled();
  lateSaved(whiteboardSceneRevision([shape()]), {
    elements: [shape()],
    files: {},
  });
  await advance();
  expect(state.begin).toHaveBeenCalledTimes(1);
  expect(state.begin.mock.calls[0][0].retireIfEmpty).toBe(false);
});

test("a confirmed empty close requests retirement without exporting a blank image", async () => {
  state.begin.mockReset().mockResolvedValue(null);
  render(<NotebookPageEditor pageId={pageId} canEdit />);
  const elements = [{ ...shape(2), isDeleted: true }];
  saved(elements);
  await advance(10_000);
  expect(state.begin).not.toHaveBeenCalled();
  close(elements);
  await advance();
  close(elements);
  await advance();
  expect(state.begin).toHaveBeenCalledTimes(1);
  expect(state.begin.mock.calls[0][0].retireIfEmpty).toBe(true);
  expect(state.export).not.toHaveBeenCalled();
  expect(state.upload).not.toHaveBeenCalled();
  expect(elements).toEqual([{ ...shape(2), isDeleted: true }]);
});
