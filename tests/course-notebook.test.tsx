import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { useEffect } from "react";

const state = vi.hoisted(() => ({
  notebook: {
    initialized: true,
    archived: false,
    canEdit: true,
    canArchive: false,
    timeZone: "America/Tegucigalpa",
  },
  pages: [
    { _id: "page-a", title: "2026-10-23", _creationTime: 1, previewUrl: null },
  ],
  pagination: "CanLoadMore",
  loadMore: vi.fn(),
  query: vi.fn(),
  initialize: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  archive: vi.fn(),
  editor: vi.fn(),
  closed: vi.fn(),
  error: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.notebook,
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    state.query(args);
    return {
      results: args === "skip" ? [] : state.pages,
      status: state.pagination,
      loadMore: state.loadMore,
    };
  },
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    return name.endsWith(":initialize")
      ? state.initialize
      : name.endsWith(":createPage")
        ? state.create
        : name.endsWith(":renamePage")
          ? state.rename
          : state.archive;
  },
}));
vi.mock("next-intl", () => ({
  useTranslations: () => translate,
  useFormatter: () => ({ dateTime: () => "Date" }),
}));
const translate = (key: string) => key;
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDynamic(props: {
      pageId?: string;
      renderTopRightUI?: () => React.ReactNode;
    }) {
      useEffect(
        () => () => {
          if (props.pageId) state.closed(props.pageId);
        },
        [props.pageId],
      );
      state.editor(props);
      return props.pageId ? (
        <div>page-editor{props.renderTopRightUI?.()}</div>
      ) : (
        <div>gallery</div>
      );
    },
}));
vi.mock("sonner", () => ({ toast: { error: state.error } }));
import { CourseNotebook } from "@/components/whiteboard/course-notebook";
const courseId = "course" as Id<"classes">;

beforeEach(() => {
  vi.clearAllMocks();
  state.notebook = {
    initialized: true,
    archived: false,
    canEdit: true,
    canArchive: false,
    timeZone: "America/Tegucigalpa",
  };
  state.pagination = "CanLoadMore";
  state.pages = [
    { _id: "page-a", title: "2026-10-23", _creationTime: 1, previewUrl: null },
  ];
  state.initialize.mockResolvedValue(null);
  state.create.mockResolvedValue("page-b");
  state.rename.mockResolvedValue(null);
  state.archive.mockResolvedValue(null);
});
afterEach(cleanup);

test("Escape from SDK text editing does not unmount the Board workspace", () => {
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const editor = screen.getByText("page-editor");
  editor.classList.add("excalidraw");
  const text = document.createElement("textarea");
  editor.append(text);
  text.focus();
  fireEvent.keyDown(text, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(state.closed).not.toHaveBeenCalled();
});

test("live picker reuses the gallery for existing and new pages without mounting another editor", async () => {
  const select = vi.fn().mockResolvedValue(undefined);
  render(<CourseNotebook classId={courseId} onSelectPage={select} />);
  const card = screen.getByRole("button", { name: "2026-10-23 Date" });
  expect(card.querySelector('[data-slot="preview-card"]')).toBeTruthy();
  expect(card.classList.contains("shadow-sm")).toBe(false);
  expect(
    screen
      .getByRole("heading", { name: "2026-10-23" })
      .closest('[data-slot="preview-card-media"]'),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  await waitFor(() =>
    expect(select).toHaveBeenCalledExactlyOnceWith("page-a", "2026-10-23"),
  );
  expect(state.editor).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  const newPage = screen.getByRole("button", { name: "newPage" });
  expect(newPage.getAttribute("data-size")).toBe("icon");
  expect(newPage.querySelector("span")?.className).toBe(
    "sr-only sm:not-sr-only",
  );
  fireEvent.click(newPage);
  await waitFor(() => expect(select).toHaveBeenLastCalledWith("page-b", ""));
  expect(state.editor).not.toHaveBeenCalled();
});

test.each([false, true])(
  "a delayed rename cannot reopen a closed page or replace another page (open another: %s)",
  async (openAnother) => {
    state.pages.push({
      _id: "page-b",
      title: "Second",
      _creationTime: 2,
      previewUrl: null,
    });
    let release!: () => void;
    state.rename.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<CourseNotebook classId={courseId} />);
    fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
    fireEvent.change(screen.getByRole("textbox", { name: "pageName" }), {
      target: { value: "Renamed first page" },
    });
    fireEvent.blur(screen.getByRole("textbox", { name: "pageName" }));
    expect(state.rename).toHaveBeenCalledExactlyOnceWith({
      pageId: "page-a",
      title: "Renamed first page",
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    if (openAnother)
      fireEvent.click(screen.getByRole("button", { name: "Second Date" }));
    await act(async () => release());
    if (openAnother) {
      expect(screen.getByRole("textbox", { name: "pageName" })).toHaveProperty(
        "value",
        "Second",
      );
      expect(state.editor).toHaveBeenLastCalledWith({
        pageId: "page-b",
        canEdit: true,
        renderTopRightUI: expect.any(Function),
      });
    } else {
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  },
);

test("gallery loads only metadata until a page opens, paginates and reuses the editor for creation and renaming", async () => {
  render(<CourseNotebook classId={courseId} />);
  expect(state.editor).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "loadMore" }));
  expect(state.loadMore).toHaveBeenCalledExactlyOnceWith(20);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  expect(await screen.findByText("page-editor")).toBeTruthy();
  expect(state.editor).toHaveBeenLastCalledWith({
    pageId: "page-a",
    canEdit: true,
    renderTopRightUI: expect.any(Function),
  });
  fireEvent.change(screen.getByRole("textbox", { name: "pageName" }), {
    target: { value: "Lesson notes" },
  });
  fireEvent.blur(screen.getByRole("textbox", { name: "pageName" }));
  await waitFor(() =>
    expect(state.rename).toHaveBeenCalledWith({
      pageId: "page-a",
      title: "Lesson notes",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "newPage" }));
  await waitFor(() =>
    expect(state.editor).toHaveBeenLastCalledWith({
      pageId: "page-b",
      canEdit: true,
      renderTopRightUI: expect.any(Function),
    }),
  );
  expect(state.create).toHaveBeenCalledExactlyOnceWith({ classId: courseId });
});

test("students can open pages but cannot create, rename or archive", async () => {
  state.notebook.canEdit = false;
  render(<CourseNotebook classId={courseId} />);
  expect(screen.queryByRole("button", { name: "newPage" })).toBeNull();
  expect(screen.queryByRole("button", { name: "archive" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  await screen.findByText("page-editor");
  expect(state.editor).toHaveBeenLastCalledWith({
    pageId: "page-a",
    canEdit: false,
    renderTopRightUI: expect.any(Function),
  });
  expect(screen.queryByRole("textbox", { name: "pageName" })).toBeNull();
  expect(state.create).not.toHaveBeenCalled();
});

test("manual archive is hidden for everyone while course editors still create and rename pages", async () => {
  const view = render(<CourseNotebook classId={courseId} />);
  expect(screen.queryByRole("button", { name: "archive" })).toBeNull();
  expect(screen.getByRole("button", { name: "newPage" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  expect(screen.getByRole("textbox", { name: "pageName" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "rename" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  state.notebook.canArchive = true;
  view.rerender(<CourseNotebook classId={courseId} />);
  expect(screen.queryByRole("button", { name: "archive" })).toBeNull();
  expect(screen.getByRole("button", { name: "newPage" })).toBeTruthy();
  expect(state.archive).not.toHaveBeenCalled();
});

test("name search is debounced, scoped to the course and preserves pagination without opening an editor", async () => {
  const view = render(<CourseNotebook classId={courseId} />);
  const search = screen.getByRole("textbox", { name: "searchByName" });
  fireEvent.change(search, { target: { value: "  Biology  " } });
  expect(state.query).toHaveBeenLastCalledWith({
    classId: courseId,
    search: "",
  });
  await waitFor(() =>
    expect(state.query).toHaveBeenLastCalledWith({
      classId: courseId,
      search: "Biology",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "loadMore" }));
  expect(state.loadMore).toHaveBeenCalledExactlyOnceWith(20);
  expect(state.editor).not.toHaveBeenCalled();
  state.pages = [];
  state.pagination = "Exhausted";
  view.rerender(<CourseNotebook classId={courseId} />);
  expect(screen.getByText("noResults")).toBeTruthy();
  expect(screen.queryByText("empty")).toBeNull();
  fireEvent.change(search, { target: { value: "" } });
  await waitFor(() => expect(screen.getByText("empty")).toBeTruthy());
  expect(state.query).toHaveBeenLastCalledWith({
    classId: courseId,
    search: "",
  });
});

test("archived notebooks do not subscribe to pages or mount an editor and restore independently", async () => {
  state.notebook.archived = true;
  state.notebook.canArchive = true;
  render(<CourseNotebook classId={courseId} />);
  expect(state.query).toHaveBeenLastCalledWith("skip");
  expect(screen.getByText("archived")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "searchByName" })).toBeNull();
  expect(state.editor).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "restore" })
      .getAttribute("data-variant"),
  ).toBe("outline");
  fireEvent.click(screen.getByRole("button", { name: "restore" }));
  await waitFor(() =>
    expect(state.archive).toHaveBeenCalledExactlyOnceWith({
      classId: courseId,
      archived: false,
    }),
  );
});

test("existing course initializes once without creating a page and reports retry errors", async () => {
  state.notebook.initialized = false;
  state.initialize.mockRejectedValueOnce(new Error("offline"));
  render(<CourseNotebook classId={courseId} />);
  await screen.findByRole("button", { name: "retry" });
  expect(state.initialize).toHaveBeenCalledExactlyOnceWith({
    classId: courseId,
  });
  fireEvent.click(screen.getByRole("button", { name: "retry" }));
  await waitFor(() => expect(state.initialize).toHaveBeenCalledTimes(2));
  expect(state.create).not.toHaveBeenCalled();
});

test("Board replaces and closes the editor in the same course workspace, then opens only the selected page", async () => {
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  expect(screen.getAllByText("page-editor")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "tab" }));
  expect(screen.queryByText("page-editor")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "pageName" })).toBeNull();
  expect(screen.queryByRole("button", { name: "rename" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "2026-10-23" })).toBeNull();
  expect(state.closed).toHaveBeenCalledExactlyOnceWith("page-a");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  const gallery = state.editor.mock.calls.at(-1)![0] as {
    classId: Id<"classes">;
    onSelectPage: (
      id: Id<"courseNotebookPages">,
      title: string,
    ) => Promise<void>;
  };
  expect(gallery.classId).toBe(courseId);
  await act(async () =>
    gallery.onSelectPage(
      "page-b" as Id<"courseNotebookPages">,
      "Previous lesson",
    ),
  );
  expect(state.editor).toHaveBeenLastCalledWith({
    pageId: "page-b",
    canEdit: true,
    renderTopRightUI: expect.any(Function),
  });
  expect(screen.queryByText("gallery")).toBeNull();
  expect(screen.getAllByText("page-editor")).toHaveLength(1);
  expect(screen.getByRole("textbox", { name: "pageName" })).toHaveProperty(
    "value",
    "Previous lesson",
  );
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(state.create).not.toHaveBeenCalled();
});

test("the single page title autosaves after typing pauses without a rename button or per-key writes", async () => {
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const input = screen.getByRole("textbox", { name: "pageName" });
  expect(input).toHaveProperty("value", "2026-10-23");
  expect(screen.queryByRole("button", { name: "rename" })).toBeNull();
  for (const value of ["Math", "Mathematics", "  Mathematics lesson  "]) {
    fireEvent.change(input, { target: { value } });
  }
  expect(state.rename).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(state.rename).toHaveBeenCalledExactlyOnceWith({
      pageId: "page-a",
      title: "Mathematics lesson",
    }),
  );
  fireEvent.blur(input);
  expect(state.rename).toHaveBeenCalledTimes(1);
});

test("closing flushes the pending title, empty titles are not sent, and failed renames can retry", async () => {
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const input = screen.getByRole("textbox", { name: "pageName" });
  fireEvent.change(input, { target: { value: "  " } });
  fireEvent.blur(input);
  expect(input).toHaveProperty("value", "2026-10-23");
  expect(state.rename).not.toHaveBeenCalled();
  state.rename.mockRejectedValueOnce(new Error("PERMISSION_DENIED"));
  fireEvent.change(input, { target: { value: "New title" } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(state.error).toHaveBeenCalledWith("operationFailed"),
  );
  expect(input).toHaveProperty("value", "New title");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(state.rename).toHaveBeenCalledTimes(2));
  expect(state.rename).toHaveBeenLastCalledWith({
    pageId: "page-a",
    title: "New title",
  });
});

test("a new page adopts its server-generated date title without renaming it", async () => {
  const view = render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "newPage" }));
  await screen.findByRole("textbox", { name: "pageName" });
  state.pages.push({
    _id: "page-b",
    title: "2026-10-24",
    _creationTime: 2,
    previewUrl: null,
  });
  view.rerender(<CourseNotebook classId={courseId} />);
  expect(screen.getByRole("textbox", { name: "pageName" })).toHaveProperty(
    "value",
    "2026-10-24",
  );
  expect(state.rename).not.toHaveBeenCalled();
});

test("late title responses cannot overwrite a newer rename after closing and reopening the same page", async () => {
  let release!: () => void;
  state.rename.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const first = screen.getByRole("textbox", { name: "pageName" });
  fireEvent.change(first, { target: { value: "First" } });
  fireEvent.blur(first);
  fireEvent.change(first, { target: { value: "Second" } });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const reopened = screen.getByRole("textbox", { name: "pageName" });
  fireEvent.change(reopened, { target: { value: "Latest" } });
  fireEvent.blur(reopened);
  await act(async () => release());
  expect(state.rename.mock.calls).toEqual([
    [{ pageId: "page-a", title: "First" }],
    [{ pageId: "page-a", title: "Second" }],
    [{ pageId: "page-a", title: "Latest" }],
  ]);
  expect(reopened).toHaveProperty("value", "Latest");
});

test("a failed older rename cannot invalidate a newer successful request with the same title", async () => {
  const requests: { resolve: () => void; reject: (error: Error) => void }[] =
    [];
  state.rename.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) =>
        requests.push({ resolve, reject }),
      ),
  );
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const input = screen.getByRole("textbox", { name: "pageName" });
  for (const value of ["Repeated", "Intermediate", "Repeated"]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
  await act(async () => {
    requests[0].reject(new Error("temporary failure"));
  });
  await act(async () => {
    requests[1].resolve();
    requests[2].resolve();
  });
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.blur(input);
  expect(input).toHaveProperty("value", "Repeated");
  expect(state.rename).toHaveBeenCalledTimes(3);
  expect(state.error).not.toHaveBeenCalled();
});

test("Back retains the confirmed title when renaming removes the page from the current search results", async () => {
  let release!: () => void;
  state.rename.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const view = render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  const input = screen.getByRole("textbox", { name: "pageName" });
  fireEvent.change(input, { target: { value: "Renamed outside filter" } });
  fireEvent.blur(input);
  state.pages = [];
  view.rerender(<CourseNotebook classId={courseId} />);
  await act(async () => release());
  fireEvent.click(screen.getByRole("button", { name: "tab" }));
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  expect(screen.getByRole("textbox", { name: "pageName" })).toHaveProperty(
    "value",
    "Renamed outside filter",
  );
});

test("leaving the browser page flushes a pending title before the debounce expires", async () => {
  render(<CourseNotebook classId={courseId} />);
  fireEvent.click(screen.getByRole("button", { name: "2026-10-23 Date" }));
  fireEvent.change(screen.getByRole("textbox", { name: "pageName" }), {
    target: { value: "Pending browser title" },
  });
  expect(state.rename).not.toHaveBeenCalled();
  fireEvent(window, new Event("pagehide"));
  expect(state.rename).toHaveBeenCalledExactlyOnceWith({
    pageId: "page-a",
    title: "Pending browser title",
  });
  const pending = new Event("beforeunload", { cancelable: true });
  fireEvent(window, pending);
  expect(pending.defaultPrevented).toBe(true);
  expect(state.rename).toHaveBeenCalledTimes(1);
  await act(async () => {});
  const confirmed = new Event("beforeunload", { cancelable: true });
  fireEvent(window, confirmed);
  expect(confirmed.defaultPrevented).toBe(false);
});
