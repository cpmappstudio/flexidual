import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  queryArgs: undefined as unknown,
  history: {} as Record<
    string,
    {
      results: Array<{
        taskId: string;
        title: string;
        dueAt?: number;
        submittedAt?: number;
        status: "pending" | "submitted" | "closed";
      }>;
      status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
    }
  >,
  loadMore: vi.fn(),
  tasks: [
    {
      taskId: "task-1",
      classId: "class-1",
      className: "Biology",
      title: "Draw a cell",
      description: "Label each part",
      dueAt: 200,
      timeZone: "America/Bogota",
    },
    {
      taskId: "task-2",
      classId: "class-2",
      className: "Literature",
      title: "Read a poem",
      timeZone: "America/Bogota",
    },
  ] as
    | Array<{
        taskId: string;
        classId: string;
        className: string;
        title: string;
        description?: string;
        dueAt?: number;
        timeZone: string;
      }>
    | undefined,
}));

vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => {
    state.queryArgs = args;
    return args === "skip" ? undefined : state.tasks;
  },
  usePaginatedQuery: (
    _query: unknown,
    args: { classId: string; status: string; studentId?: string },
  ) => ({
    ...(state.history[
      `${args.studentId ?? "self"}:${args.classId}:${args.status}`
    ] ??
      state.history[`${args.classId}:${args.status}`] ?? {
        results: [
          {
            taskId: "submitted-task",
            title: "Read a chapter",
            submittedAt: 150,
            status: "submitted",
          },
          {
            taskId: "closed-task",
            title: "Write a poem",
            dueAt: 120,
            status: "closed",
          },
        ],
        status: "Exhausted",
      }),
    loadMore: state.loadMore,
  }),
}));
vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { date?: string }) =>
    values?.date ? `${key} ${values.date}` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

import { StudentPendingTasks } from "@/components/dashboards/student-pending-tasks";

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  state.tasks = [
    {
      taskId: "task-1",
      classId: "class-1",
      className: "Biology",
      title: "Draw a cell",
      description: "Label each part",
      dueAt: 200,
      timeZone: "America/Bogota",
    },
    {
      taskId: "task-2",
      classId: "class-2",
      className: "Literature",
      title: "Read a poem",
      timeZone: "America/Bogota",
    },
  ];
  state.queryArgs = undefined;
  state.history = {};
  state.loadMore.mockReset();
});

test("profile carousel queries the selected student and clears retained tasks when switching profiles", () => {
  const props = {
    courses: [
      {
        classId: "class-1" as Id<"classes">,
        className: "Biology",
        timeZone: "UTC",
        curriculumIconKey: "dna",
      },
    ],
    now: 100,
    orgSlug: "campus",
    studentId: "student-1",
  };
  const view = render(<StudentPendingTasks {...props} />);
  expect(state.queryArgs).toEqual({
    classIds: props.courses.map((course) => course.classId),
    now: 100,
    orgSlug: "campus",
    studentId: "student-1",
  });
  expect(screen.getByText("Draw a cell")).toBeTruthy();

  state.tasks = undefined;
  view.rerender(<StudentPendingTasks {...props} studentId="student-2" />);
  expect(state.queryArgs).toMatchObject({ studentId: "student-2" });
  expect(screen.queryByText("Draw a cell")).toBeNull();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("links pending work to its course and removes it after submission", () => {
  const props = {
    courses: [
      {
        classId: "class-1" as Id<"classes">,
        className: "Biology",
        timeZone: "UTC",
        curriculumIconKey: "dna",
      },
      {
        classId: "class-2" as Id<"classes">,
        className: "Literature",
        timeZone: "UTC",
        curriculumIconKey: "books",
      },
    ],
    now: 100,
    orgSlug: "campus",
  };
  const view = render(<StudentPendingTasks {...props} />);
  expect(
    screen.getByRole("link", { name: /Draw a cell/ }).getAttribute("href"),
  ).toBe("/campus/classes/class-1?task=task-1");
  expect(
    screen
      .getByRole("link", { name: /Draw a cell/ })
      .querySelector("img")
      ?.getAttribute("src"),
  ).toBe("/curriculum-icons/dna.png");
  expect(
    screen
      .getByRole("link", { name: /Read a poem/ })
      .querySelector("img")
      ?.getAttribute("src"),
  ).toBe("/curriculum-icons/books.png");
  expect(screen.getByText("instructions:")).toBeTruthy();
  expect(screen.getByText("Label each part")).toBeTruthy();
  expect(screen.getAllByText("deadlineLabel")).toHaveLength(2);
  expect(screen.getByText("200")).toBeTruthy();
  expect(screen.getByText("noDeadline")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "dashboardPrevious" }).closest("a"),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "dashboardNext" }).closest("a"),
  ).toBeNull();
  view.rerender(<StudentPendingTasks {...props} now={300} />);
  expect(screen.getByText("200")).toBeTruthy();
  expect(screen.queryByText(/dashboardLateAllowed/)).toBeNull();
  for (const card of screen.getAllByRole("link")) {
    expect(card.classList.contains("border-border")).toBe(true);
    expect(card.classList.contains("hover:bg-muted/40")).toBe(true);
  }

  state.tasks = [];
  view.rerender(<StudentPendingTasks {...props} />);
  expect(screen.queryByText("Draw a cell")).toBeNull();
  expect(screen.getByText("dashboardEmpty")).toBeTruthy();
});

test("empty tasks show a stable task-specific encouragement without affecting the carousel", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
  state.tasks = [];
  const props = {
    courses: [
      {
        classId: "class-1" as Id<"classes">,
        className: "Biology",
        timeZone: "UTC",
        curriculumIconKey: "dna",
      },
    ],
    now: 100,
    orgSlug: "campus",
  };
  const { rerender, container } = render(<StudentPendingTasks {...props} />);

  expect(screen.getByText("dashboardEmpty")).toBeTruthy();
  expect(screen.getByText("dashboardEncouragement.discover")).toBeTruthy();
  expect(container.querySelector('img[src*="nice.png"]')).toBeTruthy();

  random.mockReturnValue(0);
  rerender(<StudentPendingTasks {...props} now={200} />);
  expect(screen.getByText("dashboardEncouragement.discover")).toBeTruthy();

  state.tasks = [
    {
      taskId: "task-1",
      classId: "class-1",
      className: "Biology",
      title: "Draw a cell",
      timeZone: "America/Bogota",
    },
  ];
  rerender(<StudentPendingTasks {...props} />);
  expect(screen.getByRole("link", { name: /Draw a cell/ })).toBeTruthy();
  expect(screen.queryByText(/dashboardEncouragement/)).toBeNull();

  state.tasks = [];
  rerender(<StudentPendingTasks {...props} />);
  expect(screen.getByText("dashboardEncouragement.review")).toBeTruthy();

  rerender(<StudentPendingTasks {...props} courses={undefined} />);
  expect(screen.queryByText(/dashboardEncouragement/)).toBeNull();
  expect(container.querySelector('img[src*="nice.png"]')).toBeNull();
});

test("view all opens course history with delivery states and task links", () => {
  state.tasks = [];
  render(
    <StudentPendingTasks
      courses={[
        {
          classId: "class-1" as Id<"classes">,
          className: "Biology",
          timeZone: "UTC",
          curriculumIconKey: "dna",
        },
      ]}
      now={200}
      orgSlug="campus"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  expect(screen.getByText("historyTitle")).toBeTruthy();
  expect(screen.getByText("Biology")).toBeTruthy();
  expect(
    screen
      .getByText("Biology")
      .closest("h3")
      ?.querySelector("img")
      ?.getAttribute("src"),
  ).toBe("/curriculum-icons/dna.png");
  expect(screen.getByText("submittedOnTime")).toBeTruthy();
  expect(screen.getByText("historyClosed")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /Read a chapter/ }).getAttribute("href"),
  ).toBe("/campus/classes/class-1?task=submitted-task");
});

test("history hides empty courses and sorts courses with assignments by name", () => {
  state.tasks = [];
  state.history = {
    "class-a:all": { results: [], status: "Exhausted" },
    "class-z:all": {
      results: [{ taskId: "z-task", title: "Z task", status: "pending" }],
      status: "Exhausted",
    },
    "class-b:all": {
      results: [{ taskId: "b-task", title: "B task", status: "submitted" }],
      status: "Exhausted",
    },
  };
  render(
    <StudentPendingTasks
      courses={[
        {
          classId: "class-a" as Id<"classes">,
          className: "Astronomy",
          timeZone: "UTC",
          curriculumIconKey: "moon",
        },
        {
          classId: "class-z" as Id<"classes">,
          className: "Zoology",
          timeZone: "UTC",
          curriculumIconKey: "books",
        },
        {
          classId: "class-b" as Id<"classes">,
          className: "Biology",
          timeZone: "UTC",
          curriculumIconKey: "dna",
        },
      ]}
      now={200}
      orgSlug="campus"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent),
  ).toEqual(["Biology", "Zoology"]);
  expect(within(dialog).queryByText("Astronomy")).toBeNull();
  expect(within(dialog).queryByText("historyEmptyCourse")).toBeNull();
});

test("history keeps scanning when the current filtered page has no matches", () => {
  state.tasks = [];
  state.history = {
    "class-1:all": { results: [], status: "CanLoadMore" },
  };
  const props = {
    courses: [
      {
        classId: "class-1" as Id<"classes">,
        className: "Biology",
        timeZone: "UTC",
        curriculumIconKey: "dna",
      },
    ],
    now: 200,
    orgSlug: "campus",
  };
  const view = render(<StudentPendingTasks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  expect(state.loadMore).toHaveBeenCalledWith(10);
  expect(screen.queryByText("historyEmpty")).toBeNull();

  state.history["class-1:all"] = {
    results: [{ taskId: "older-task", title: "Older task", status: "closed" }],
    status: "Exhausted",
  };
  view.rerender(<StudentPendingTasks {...props} />);
  expect(screen.getByText("Older task")).toBeTruthy();
});

test("history keeps loaded tasks visible while a new minute is loading", () => {
  state.tasks = [];
  state.history = {
    "class-1:all": {
      results: [{ taskId: "task-1", title: "Current task", status: "pending" }],
      status: "Exhausted",
    },
  };
  const props = {
    courses: [
      {
        classId: "class-1" as Id<"classes">,
        className: "Biology",
        timeZone: "UTC",
        curriculumIconKey: "dna",
      },
    ],
    now: 200,
    orgSlug: "campus",
  };
  const view = render(<StudentPendingTasks {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Current task")).toBeTruthy();

  state.history["class-1:all"] = {
    results: [],
    status: "LoadingFirstPage",
  };
  view.rerender(<StudentPendingTasks {...props} now={201} />);
  expect(within(dialog).getByText("Current task")).toBeTruthy();
  expect(dialog.querySelector('[data-slot="skeleton"]')).toBeNull();

  state.history["class-1:all"] = { results: [], status: "CanLoadMore" };
  view.rerender(<StudentPendingTasks {...props} now={201} />);
  expect(within(dialog).getByText("Current task")).toBeTruthy();
  expect(state.loadMore).toHaveBeenCalledWith(10);

  state.history["class-1:all"] = { results: [], status: "Exhausted" };
  view.rerender(<StudentPendingTasks {...props} now={201} />);
  expect(within(dialog).queryByText("Current task")).toBeNull();
  expect(within(dialog).getByText("historyEmpty")).toBeTruthy();
});

test("history does not retain another student's tasks", () => {
  state.tasks = [];
  state.history = {
    "student-1:class-1:all": {
      results: [
        { taskId: "task-1", title: "First student task", status: "pending" },
      ],
      status: "Exhausted",
    },
    "student-2:class-1:all": {
      results: [],
      status: "LoadingFirstPage",
    },
  };
  const props = {
    courses: [
      {
        classId: "class-1" as Id<"classes">,
        className: "Biology",
        timeZone: "UTC",
        curriculumIconKey: "dna",
      },
    ],
    now: 200,
    orgSlug: "campus",
  };
  const view = render(<StudentPendingTasks {...props} studentId="student-1" />);
  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  expect(screen.getByText("First student task")).toBeTruthy();

  view.rerender(<StudentPendingTasks {...props} studentId="student-2" />);
  expect(screen.queryByText("First student task")).toBeNull();
});

test("history does not retain tasks from the previous status filter", () => {
  state.tasks = [];
  state.history = {
    "class-1:all": {
      results: [{ taskId: "task-1", title: "Open task", status: "pending" }],
      status: "Exhausted",
    },
    "class-1:submitted": { results: [], status: "LoadingFirstPage" },
  };
  render(
    <StudentPendingTasks
      courses={[
        {
          classId: "class-1" as Id<"classes">,
          className: "Biology",
          timeZone: "UTC",
          curriculumIconKey: "dna",
        },
      ]}
      now={200}
      orgSlug="campus"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Open task")).toBeTruthy();

  fireEvent.pointerDown(
    within(dialog).getByRole("combobox", { name: "historyStatusFilter" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  fireEvent.click(screen.getByRole("option", { name: "historySubmitted" }));
  expect(within(dialog).queryByText("Open task")).toBeNull();
  expect(dialog.querySelector('[data-slot="skeleton"]')).not.toBeNull();
});

test("history filters all pages by status and shows a selected empty course", () => {
  state.tasks = [];
  state.history = {
    "class-a:all": {
      results: [{ taskId: "a-task", title: "Open task", status: "pending" }],
      status: "Exhausted",
    },
    "class-b:all": {
      results: [
        { taskId: "b-task", title: "Delivered task", status: "submitted" },
      ],
      status: "Exhausted",
    },
    "class-a:submitted": { results: [], status: "Exhausted" },
    "class-b:submitted": {
      results: [
        { taskId: "b-task", title: "Delivered task", status: "submitted" },
      ],
      status: "Exhausted",
    },
  };
  render(
    <StudentPendingTasks
      courses={[
        {
          classId: "class-a" as Id<"classes">,
          className: "Astronomy",
          timeZone: "UTC",
          curriculumIconKey: "moon",
        },
        {
          classId: "class-b" as Id<"classes">,
          className: "Biology",
          timeZone: "UTC",
          curriculumIconKey: "dna",
        },
      ]}
      now={200}
      orgSlug="campus"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /historyOpen/ }));
  const dialog = screen.getByRole("dialog");
  fireEvent.pointerDown(
    within(dialog).getByRole("combobox", { name: "historyStatusFilter" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  fireEvent.click(screen.getByRole("option", { name: "historySubmitted" }));
  expect(within(dialog).queryByText("Astronomy")).toBeNull();
  expect(within(dialog).getByText("Delivered task")).toBeTruthy();

  fireEvent.click(
    within(dialog).getByRole("combobox", { name: "historyCourseFilter" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "Astronomy" }));
  expect(
    within(dialog).getByRole("heading", { name: "Astronomy" }),
  ).toBeTruthy();
  expect(within(dialog).getByText("historyNoMatches")).toBeTruthy();
});
