import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  latest: {
    name: "work.pdf",
    version: "original",
    revision: 1,
    classId: "course",
    taskId: "task",
    studentId: "student",
    studentName: "Student",
    taskTitle: "Write a story",
    courseName: "Literature 8",
    authorName: "Teacher",
    lastSaveId: undefined as string | undefined,
  } as Record<string, unknown> | null,
  request: vi.fn(),
  exportPdf: vi.fn(),
  mounts: 0,
  replace: vi.fn(),
}));
vi.mock("convex/react", () => ({ useQuery: () => state.latest }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-task-file-request", () => ({
  useTaskFileRequest: () => state.request,
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function Viewer({
      viewerRef,
      onReady,
      onChange,
      readOnly,
    }: {
      readOnly?: boolean;
      viewerRef: React.Ref<{ exportPdf: () => Promise<Blob> }>;
      onReady: () => void;
      onChange: () => void;
    }) {
      const ready = useRef(onReady);
      useImperativeHandle(viewerRef, () => ({ exportPdf: state.exportPdf }));
      useEffect(() => {
        state.mounts++;
        ready.current();
      }, []);
      return (
        <button data-readonly={String(readOnly)} onClick={onChange}>
          Draw
        </button>
      );
    },
}));
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TaskPdfEditor } from "@/components/teaching/classes/task-pdf-editor";

beforeEach(() => {
  state.latest = {
    name: "work.pdf",
    version: "original",
    revision: 1,
    classId: "course",
    taskId: "task",
    studentId: "student",
    studentName: "Student",
    taskTitle: "Write a story",
    courseName: "Literature 8",
    authorName: "Teacher",
  };
  state.mounts = 0;
  state.replace.mockReset();
  window.history.replaceState({}, "", "/campus/task-files/file/edit");
  vi.spyOn(window, "close").mockImplementation(() => {});
  state.exportPdf
    .mockReset()
    .mockResolvedValue(
      new Blob(["%PDF-1.4 corrected"], { type: "application/pdf" }),
    );
  state.request
    .mockReset()
    .mockImplementation((_params, init) =>
      init?.method === "PUT"
        ? Promise.resolve(Response.json({ version: "saved" }))
        : Promise.resolve(new Response(new Blob(["%PDF-1.4"]))),
    );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:current");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Editor(props: Partial<ComponentProps<typeof TaskPdfEditor>> = {}) {
  return <TaskPdfEditor fileId="file" {...props} />;
}

async function openEditor(
  props: Partial<ComponentProps<typeof TaskPdfEditor>> = {},
) {
  const view = render(<Editor {...props} />);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "fileActions" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  return view;
}

function browserExitIsBlocked() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

test.each([false, true])(
  "a clean viewer in editing mode %s installs no unload warning and closes without a prompt",
  async (editing) => {
    const addListener = vi.spyOn(window, "addEventListener");
    const close = vi.fn();
    await openEditor({ initialEditing: editing, onClose: close });
    expect(browserExitIsBlocked()).toBe(false);
    expect(
      addListener.mock.calls.filter(([type]) => type === "beforeunload"),
    ).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.exportPdf).not.toHaveBeenCalled();
  },
);

test("the unload warning exists only while edits are pending and is removed on unmount", async () => {
  const addListener = vi.spyOn(window, "addEventListener");
  const removeListener = vi.spyOn(window, "removeEventListener");
  const view = await openEditor();
  expect(browserExitIsBlocked()).toBe(false);
  fireEvent.click(screen.getByText("Draw"));
  expect(browserExitIsBlocked()).toBe(true);
  const listeners = addListener.mock.calls.filter(
    ([type]) => type === "beforeunload",
  );
  expect(listeners).toHaveLength(1);
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.click(screen.getByRole("button", { name: "restoreViewer" }));
  expect(
    addListener.mock.calls.filter(([type]) => type === "beforeunload"),
  ).toHaveLength(1);
  view.unmount();
  expect(removeListener).toHaveBeenCalledWith("beforeunload", listeners[0][1]);
  expect(browserExitIsBlocked()).toBe(false);
});

test("opening, editing, and closing a PDF never patches browser history or adds state fields", async () => {
  const push = window.history.pushState;
  const replace = window.history.replaceState;
  const view = await openEditor();
  fireEvent.click(screen.getByText("Draw"));
  expect(window.history.pushState).toBe(push);
  expect(window.history.replaceState).toBe(replace);
  window.history.pushState(null, "", "#features");
  expect(window.history.state).toBeNull();
  window.history.replaceState({ __NA: true }, "", "/campus/classes/course");
  expect(window.history.state).toEqual({ __NA: true });
  view.unmount();
  expect(window.history.pushState).toBe(push);
  expect(window.history.replaceState).toBe(replace);
  expect(browserExitIsBlocked()).toBe(false);
});

test("save and return waits for server confirmation and replaces the route without an unsaved warning", async () => {
  await openEditor();
  expect(screen.getByRole("heading", { name: "work.pdf" })).toBeTruthy();
  expect(screen.getByText("Write a story")).toBeTruthy();
  expect(screen.getByText("Literature 8")).toBeTruthy();
  expect(screen.getByText("work.pdf")).toBeTruthy();
  expect(screen.getByText("noChanges")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "saveAndReturn" })
      .hasAttribute("disabled"),
  ).toBe(true);
  let confirmSave!: (response: Response) => void;
  state.request.mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      confirmSave = resolve;
    }),
  );
  let preventedOnReturn: boolean | undefined;
  state.replace.mockImplementation(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    preventedOnReturn = event.defaultPrevented;
  });
  fireEvent.click(screen.getByText("Draw"));
  expect(screen.getByText("unsavedChanges").getAttribute("data-slot")).toBe(
    "badge",
  );
  fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
  expect(window.close).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "saving" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "fileActions" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(browserExitIsBlocked()).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(state.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "work.pdf" })).toBeTruthy();
  await act(async () => {
    confirmSave(Response.json({ version: "saved" }));
  });
  await waitFor(() =>
    expect(state.replace).toHaveBeenCalledWith(
      "/campus/classes/course?task=task&student=student",
    ),
  );
  expect(preventedOnReturn).toBe(false);
  expect(browserExitIsBlocked()).toBe(false);
  expect(window.close).not.toHaveBeenCalled();
  expect(state.mounts).toBe(1);
  expect(state.exportPdf).toHaveBeenCalledOnce();
});

test("network retries reuse the same exported PDF and operation id", async () => {
  await openEditor();
  state.request.mockRejectedValueOnce(new Error("network"));
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
  await waitFor(() => expect(screen.getByText("saveFailed")).toBeTruthy());
  expect(browserExitIsBlocked()).toBe(true);
  expect(screen.getByText("saveUnconfirmed")).toBeTruthy();
  expect(window.close).not.toHaveBeenCalled();
  const first = state.request.mock.calls.find(
    ([, init]) => init?.method === "PUT",
  )!;
  fireEvent.click(screen.getByRole("button", { name: "retrySave" }));
  await waitFor(() =>
    expect(
      state.request.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(2),
  );
  const second = state.request.mock.calls.filter(
    ([, init]) => init?.method === "PUT",
  )[1];
  expect(second[0]).toEqual(first[0]);
  expect(second[1].body).toBe(first[1].body);
  expect(state.exportPdf).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(state.replace).toHaveBeenCalledOnce());
  expect(browserExitIsBlocked()).toBe(false);
});

test.each(["export", "response"])(
  "a failed %s keeps corrections protected and permits a successful retry",
  async (failure) => {
    await openEditor();
    if (failure === "export")
      state.exportPdf.mockRejectedValueOnce(new Error("export"));
    else state.request.mockResolvedValueOnce(Response.json({}));
    fireEvent.click(screen.getByText("Draw"));
    fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
    await screen.findByText("saveFailed");
    expect(state.replace).not.toHaveBeenCalled();
    expect(browserExitIsBlocked()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "keepEditing",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(browserExitIsBlocked()).toBe(true);
    fireEvent.click(
      screen.getByRole("button", {
        name: failure === "export" ? "saveAndReturn" : "retrySave",
      }),
    );
    await waitFor(() => expect(state.replace).toHaveBeenCalledOnce());
    expect(state.exportPdf).toHaveBeenCalledTimes(failure === "export" ? 2 : 1);
    expect(browserExitIsBlocked()).toBe(false);
  },
);

test("closing after a failed save discards only local work without retrying the upload", async () => {
  await openEditor();
  state.request.mockRejectedValueOnce(new Error("network"));
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
  await screen.findByText("saveFailed");
  fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "leaveWithoutSaving",
    }),
  );
  await waitFor(() => expect(state.replace).toHaveBeenCalledOnce());
  expect(
    state.request.mock.calls.filter(([, init]) => init?.method === "PUT"),
  ).toHaveLength(1);
  expect(state.exportPdf).toHaveBeenCalledOnce();
  expect(browserExitIsBlocked()).toBe(false);
});

test("clicking outside a dirty PDF asks before closing", async () => {
  const close = vi.fn();
  await openEditor({ onClose: close });
  fireEvent.click(screen.getByText("Draw"));
  const overlay = document.querySelector('[data-slot="dialog-overlay"]')!;
  fireEvent.pointerDown(overlay, { button: 0, pointerType: "mouse" });
  const confirmation = await screen.findByRole("alertdialog");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "keepEditing" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(browserExitIsBlocked()).toBe(true);
});

test.each([
  null,
  { version: "another-correction", lastSaveId: "other-tab", revision: 1 },
  { revision: 2 },
])(
  "a changed or removed file blocks saving without resetting local edits: %s",
  async (update) => {
    const view = await openEditor();
    fireEvent.click(screen.getByText("Draw"));
    state.latest = update && { ...state.latest, ...update };
    view.rerender(<Editor />);
    expect(screen.getByText("conflict")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "saveAndReturn" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "fileActions" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(state.mounts).toBe(1);
    expect(window.close).not.toHaveBeenCalled();
    expect(browserExitIsBlocked()).toBe(true);
  },
);

test("dirty editors keep the browser close warning and use shadcn to cancel local close", async () => {
  await openEditor();
  fireEvent.click(screen.getByText("Draw"));
  const beforeUnload = new Event("beforeunload", { cancelable: true });
  act(() => {
    window.dispatchEvent(beforeUnload);
  });
  expect(beforeUnload.defaultPrevented).toBe(true);
  const nativeConfirm = vi.spyOn(window, "confirm");
  fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(
    within(dialog).getByRole("heading", { name: "leaveTitle" }),
  ).toBeTruthy();
  expect(within(dialog).getByText("leaveUnsaved")).toBeTruthy();
  const cancel = within(dialog).getByRole("button", { name: "keepEditing" });
  await waitFor(() => expect(document.activeElement).toBe(cancel));
  fireEvent.click(cancel);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(state.replace).not.toHaveBeenCalled();
  expect(screen.getByText("unsavedChanges")).toBeTruthy();
  expect(state.mounts).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
  const reopened = await screen.findByRole("alertdialog");
  fireEvent.keyDown(reopened, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(state.replace).not.toHaveBeenCalled();
});

test("Escape on a dirty PDF opens confirmation; cancelling keeps edits and confirming closes only the viewer", async () => {
  const close = vi.fn();
  await openEditor({ onClose: close });
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.keyDown(document, { key: "Escape" });
  let dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "keepEditing" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(close).not.toHaveBeenCalled();
  expect(browserExitIsBlocked()).toBe(true);
  fireEvent.keyDown(document, { key: "Escape" });
  dialog = await screen.findByRole("alertdialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "leaveWithoutSaving" }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(browserExitIsBlocked()).toBe(false);
  expect(state.replace).not.toHaveBeenCalled();
  expect(state.exportPdf).not.toHaveBeenCalled();
});

test("leaving without saving returns once, removes the warning, and does not save the PDF", async () => {
  let preventedOnReturn: boolean | undefined;
  state.replace.mockImplementation(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    preventedOnReturn = event.defaultPrevented;
  });
  await openEditor();
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "leaveWithoutSaving" }),
  );
  await waitFor(() =>
    expect(state.replace).toHaveBeenCalledExactlyOnceWith(
      "/campus/classes/course?task=task&student=student",
    ),
  );
  expect(state.exportPdf).not.toHaveBeenCalled();
  expect(preventedOnReturn).toBe(false);
  expect(
    state.request.mock.calls.filter(([, init]) => init?.method === "PUT"),
  ).toHaveLength(0);
});

test.each([false, true])(
  "a server conflict protects local edits when returning from modal mode %s",
  async (modal) => {
    const close = vi.fn();
    await openEditor(modal ? { onClose: close } : {});
    state.request.mockRejectedValueOnce(new Error("TASK_CORRECTION_CONFLICT"));
    fireEvent.click(screen.getByText("Draw"));
    fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
    await waitFor(() => expect(screen.getByText("conflict")).toBeTruthy());
    expect(
      screen
        .getByRole("button", { name: "retrySave" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "useCurrentSubmission" }),
    );
    const confirmation = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "keepEditing" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(state.replace).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(browserExitIsBlocked()).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "fileActions" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "useCurrentSubmission" }),
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "leaveWithoutSaving",
      }),
    );
    await waitFor(() =>
      expect(modal ? close : state.replace).toHaveBeenCalledOnce(),
    );
    expect(modal ? state.replace : close).not.toHaveBeenCalled();
    expect(browserExitIsBlocked()).toBe(false);
  },
);

test("preview expands into correction in place and resizing preserves the loaded PDF", async () => {
  const close = vi.fn();
  render(<Editor initialEditing={false} onClose={close} />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "edit" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  const viewer = screen.getByText("Draw");
  expect(viewer.getAttribute("data-readonly")).toBe("true");
  expect(screen.queryByRole("button", { name: "saveAndReturn" })).toBeNull();
  fireEvent.click(viewer);
  fireEvent.click(screen.getByRole("button", { name: "edit" }));
  expect(viewer.getAttribute("data-readonly")).toBe("false");
  expect(screen.getByRole("button", { name: "restoreViewer" })).toBeTruthy();
  expect(screen.getByText("noChanges")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "restoreViewer" }));
  fireEvent.click(viewer);
  fireEvent.click(screen.getByRole("button", { name: "expandViewer" }));
  expect(screen.getByText("unsavedChanges")).toBeTruthy();
  expect(state.mounts).toBe(1);
  expect(state.request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "leaveWithoutSaving",
    }),
  );
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(state.replace).not.toHaveBeenCalled();
  expect(state.exportPdf).not.toHaveBeenCalled();
});

test("saving closes the dialog and preserves the underlying review without navigating", async () => {
  function Review() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <textarea
          aria-label="General comment"
          defaultValue="Keep this comment"
        />
        {open && <Editor onClose={() => setOpen(false)} />}
      </>
    );
  }
  render(<Review />);
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "fileActions" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    (
      screen.getByRole("textbox", {
        name: "General comment",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Keep this comment");
  expect(state.replace).not.toHaveBeenCalled();
});

test("an unavailable file does not load or expose editing and can still be closed", async () => {
  state.latest = null;
  const close = vi.fn();
  render(<Editor onClose={close} />);
  expect(screen.getByText("unavailable")).toBeTruthy();
  expect(state.request).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "saveAndReturn" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "backToSubmission" }));
  expect(close).toHaveBeenCalledOnce();
});

test("the PDF dialog is portaled outside the submission sheet and expands without duplicating its viewer", async () => {
  function ReviewSheet() {
    const [open, setOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(true);
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Submission review</SheetTitle>
          <textarea
            aria-label="Review comment"
            defaultValue="Keep this draft"
          />
          <button onClick={() => setOpen(true)}>Preview PDF</button>
          {open && (
            <Editor initialEditing={false} onClose={() => setOpen(false)} />
          )}
        </SheetContent>
      </Sheet>
    );
  }
  render(<ReviewSheet />);
  const sheet = screen.getByRole("dialog", { name: "Submission review" });
  fireEvent.click(within(sheet).getByText("Preview PDF"));
  const pdf = await screen.findByRole("dialog", { name: "work.pdf" });
  expect(sheet.contains(pdf)).toBe(false);
  expect(pdf.parentElement).toBe(window.document.body);
  expect(within(sheet).queryByText("Draw")).toBeNull();
  await waitFor(() =>
    expect(
      within(pdf)
        .getByRole("button", { name: "edit" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(within(pdf).getByRole("button", { name: "edit" }));
  expect(pdf.classList.contains("h-dvh")).toBe(true);
  expect(pdf.classList.contains("w-screen")).toBe(true);
  expect(state.mounts).toBe(1);
  expect(screen.getAllByText("Draw")).toHaveLength(1);
  fireEvent.click(
    within(pdf).getByRole("button", { name: "backToSubmission" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "work.pdf" })).toBeNull(),
  );
  expect(
    (
      within(sheet).getByRole("textbox", {
        name: "Review comment",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Keep this draft");
  expect(screen.getByRole("dialog", { name: "Submission review" })).toBe(sheet);
  fireEvent.click(within(sheet).getByText("Preview PDF"));
  await screen.findByRole("dialog", { name: "work.pdf" });
  fireEvent.keyDown(window.document, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "work.pdf" })).toBeNull(),
  );
  expect(screen.getByRole("dialog", { name: "Submission review" })).toBe(sheet);
});

test.each([
  { editing: false, dirty: false },
  { editing: true, dirty: false },
  { editing: true, dirty: true },
])(
  "the download menu works without saving in mode %j and Escape closes only the menu",
  async ({ editing, dirty }) => {
    render(<Editor initialEditing={editing} />);
    const trigger = screen.getByRole("button", { name: "fileActions" });
    await waitFor(() => expect(trigger.hasAttribute("disabled")).toBe(false));
    if (dirty) fireEvent.click(screen.getByText("Draw"));
    const clickDownload = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
    const item = await screen.findByRole("menuitem", {
      name: editing ? "downloadCopy" : "download",
    });
    await waitFor(() => expect(document.activeElement).toBe(item));
    fireEvent.keyDown(item, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByRole("dialog", { name: "work.pdf" })).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    const reopenedItem = await screen.findByRole("menuitem", {
      name: editing ? "downloadCopy" : "download",
    });
    fireEvent.keyDown(reopenedItem, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(clickDownload).toHaveBeenCalledOnce());
    expect(state.exportPdf).toHaveBeenCalledOnce();
    expect(
      state.request.mock.calls.filter(([, init]) => init?.method === "PUT"),
    ).toHaveLength(0);
    expect(state.mounts).toBe(1);
  },
);

test("a failed save can still download its pending PDF from the menu without exporting it again", async () => {
  await openEditor();
  const clickDownload = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  state.request.mockRejectedValueOnce(new Error("network"));
  fireEvent.click(screen.getByText("Draw"));
  fireEvent.click(screen.getByRole("button", { name: "saveAndReturn" }));
  await screen.findByText("saveFailed");
  const trigger = screen.getByRole("button", { name: "fileActions" });
  expect(trigger.hasAttribute("disabled")).toBe(false);
  fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "downloadCopy" }),
  );
  await waitFor(() => expect(clickDownload).toHaveBeenCalledOnce());
  expect(state.exportPdf).toHaveBeenCalledOnce();
  const save = state.request.mock.calls.find(
    ([, init]) => init?.method === "PUT",
  )!;
  expect(URL.createObjectURL).toHaveBeenLastCalledWith(save[1].body);
});
