import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef, useEffect, useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const state = vi.hoisted(() => ({
  pages: {} as Record<number, unknown[]>,
  pageCount: 1,
  annotationEvent: vi.fn() as (event: { type: string }) => void,
  stop: vi.fn(),
  commit: vi.fn(),
  saveAsCopy: vi.fn(),
  setLocked: vi.fn(),
  setActiveTool: vi.fn(),
  setDisabledCategories: vi.fn(),
  mounts: 0,
}));
vi.mock("next-intl", () => ({ useLocale: () => "es" }));
vi.mock("@embedpdf/react-pdf-viewer", () => ({
  LockModeType: { All: "all", None: "none" },
  ZoomMode: { FitWidth: "fit-width" },
  PDFViewer: ({ onReady }: { onReady: (value: unknown) => void }) => {
    const ready = useRef(onReady);
    useEffect(() => {
      state.mounts++;
      ready.current({
        getPlugin: () => ({
          provides: () => ({
            setLocked: state.setLocked,
            setActiveTool: state.setActiveTool,
            setDisabledCategories: state.setDisabledCategories,
            getActiveDocument: () => ({ pageCount: state.pageCount }),
            getState: () => ({ pages: state.pages }),
            onAnnotationEvent: (callback: typeof state.annotationEvent) => {
              state.annotationEvent = callback;
              return state.stop;
            },
            onDocumentOpened: () => state.stop,
            onActiveDocumentChanged: () => state.stop,
            onDocumentError: () => state.stop,
            onHistoryChange: () => state.stop,
            commit: () => ({ toPromise: state.commit }),
            saveAsCopy: () => ({ toPromise: state.saveAsCopy }),
          }),
        }),
      });
    }, []);
    return (
      <div
        data-testid="pdf-host"
        ref={(host) => {
          if (!host || host.shadowRoot) return;
          const scroller = document.createElement("div");
          scroller.style.overflow = "auto";
          Object.defineProperties(scroller, {
            scrollHeight: { value: 1200 },
            clientHeight: { value: 200 },
            scrollWidth: { value: 1200 },
            clientWidth: { value: 200 },
          });
          host.attachShadow({ mode: "open" }).append(scroller);
        }}
      />
    );
  },
}));
import TaskPdfViewer, {
  type TaskPdfViewerHandle,
} from "@/components/teaching/classes/task-pdf-viewer";

afterEach(() => {
  cleanup();
  state.mounts = 0;
  state.setLocked.mockClear();
  state.setActiveTool.mockClear();
  state.setDisabledCategories.mockClear();
  state.pages = {};
  state.pageCount = 1;
  state.stop.mockClear();
  state.commit.mockReset();
  state.saveAsCopy.mockReset();
});

test("editing waits for existing annotations to load and unregisters the listeners on close", () => {
  const ready = vi.fn();
  const view = render(
    <TaskPdfViewer src="blob:pdf" name="work.pdf" onReady={ready} />,
  );
  expect(ready).not.toHaveBeenCalled();
  state.pages = { 0: [] };
  act(() => state.annotationEvent({ type: "loaded" }));
  expect(ready).toHaveBeenCalledOnce();
  view.unmount();
  expect(state.stop).toHaveBeenCalledTimes(5);
});

test("a PDF with no pages reports an error instead of loading indefinitely", () => {
  state.pageCount = 0;
  const error = vi.fn();
  render(<TaskPdfViewer src="blob:empty" name="work.pdf" onError={error} />);
  expect(error).toHaveBeenCalledOnce();
});

test("export waits for annotation commits and returns their PDF bytes", async () => {
  let finishCommit!: () => void;
  state.commit.mockReturnValue(
    new Promise<void>((resolve) => {
      finishCommit = resolve;
    }),
  );
  const bytes = new TextEncoder().encode("%PDF-1.4 corrected");
  state.saveAsCopy.mockResolvedValue(bytes.buffer);
  const viewer = createRef<TaskPdfViewerHandle>();
  render(<TaskPdfViewer src="blob:pdf" name="work.pdf" viewerRef={viewer} />);
  const exporting = viewer.current!.exportPdf();
  expect(state.commit).toHaveBeenCalledOnce();
  expect(state.saveAsCopy).not.toHaveBeenCalled();
  finishCommit();
  const blob = await exporting;
  expect(state.saveAsCopy).toHaveBeenCalledOnce();
  expect(blob.type).toBe("application/pdf");
  expect(blob.size).toBe(bytes.byteLength);
});

test("failed annotation commits reject export instead of producing an incomplete PDF", async () => {
  state.commit.mockRejectedValue(new Error("COMMIT_FAILED"));
  const viewer = createRef<TaskPdfViewerHandle>();
  render(<TaskPdfViewer src="blob:pdf" name="work.pdf" viewerRef={viewer} />);
  await expect(viewer.current!.exportPdf()).rejects.toThrow("COMMIT_FAILED");
  expect(state.saveAsCopy).not.toHaveBeenCalled();
});

test("switching from preview to correction unlocks the same viewer without reloading its document", () => {
  const view = render(<TaskPdfViewer src="blob:pdf" name="work.pdf" />);
  expect(state.setLocked).toHaveBeenLastCalledWith({ type: "all" });
  expect(state.setDisabledCategories).toHaveBeenLastCalledWith(
    expect.arrayContaining(["annotation", "insert", "history"]),
  );
  view.rerender(
    <TaskPdfViewer src="blob:pdf" name="work.pdf" readOnly={false} />,
  );
  expect(state.mounts).toBe(1);
  expect(state.setLocked).toHaveBeenLastCalledWith({ type: "none" });
  expect(state.setDisabledCategories.mock.lastCall![0]).not.toContain(
    "annotation",
  );
  view.rerender(<TaskPdfViewer src="blob:pdf" name="work.pdf" />);
  expect(state.setActiveTool).toHaveBeenLastCalledWith(null);
  expect(state.setLocked).toHaveBeenLastCalledWith({ type: "all" });
  expect(state.mounts).toBe(1);
});

test.each([true, false])(
  "modal scroll locks allow native PDF gestures and still block background scrolling (readOnly=%s)",
  (readOnly) => {
    const { container } = render(
      <>
        <div data-testid="background">Background</div>
        <Sheet open>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>Submission</SheetTitle>
            <Dialog open>
              <DialogContent aria-describedby={undefined}>
                <DialogTitle>PDF</DialogTitle>
                <TaskPdfViewer
                  src="blob:pdf"
                  name="work.pdf"
                  readOnly={readOnly}
                />
              </DialogContent>
            </Dialog>
          </SheetContent>
        </Sheet>
      </>,
    );
    const scroller =
      screen.getByTestId("pdf-host").shadowRoot!.firstElementChild!;
    const received = vi.fn();
    scroller.addEventListener("wheel", received);
    for (const delta of [
      { deltaY: 80 },
      { deltaX: 80 },
      { deltaY: -80 },
      { deltaY: 80, ctrlKey: true },
    ]) {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        composed: true,
        cancelable: true,
        ...delta,
      });
      fireEvent(scroller, event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(received).toHaveBeenCalledTimes(4);
    expect(
      fireEvent.touchStart(scroller, {
        composed: true,
        touches: [{ clientX: 100, clientY: 100 }],
        changedTouches: [{ clientX: 100, clientY: 100 }],
      }),
    ).toBe(true);
    expect(
      fireEvent.touchMove(scroller, {
        composed: true,
        touches: [{ clientX: 100, clientY: 50 }],
        changedTouches: [{ clientX: 100, clientY: 50 }],
      }),
    ).toBe(true);
    const outside = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    });
    fireEvent(container.querySelector('[data-testid="background"]')!, outside);
    expect(outside.defaultPrevented).toBe(true);
  },
);
