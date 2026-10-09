import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  queryArgs: undefined as unknown,
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
}));
vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
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
});

test("profile carousel queries the selected student and clears retained tasks when switching profiles", () => {
  const props = {
    classIds: ["class-1"] as Id<"classes">[],
    now: 100,
    orgSlug: "campus",
    studentId: "student-1",
  };
  const view = render(<StudentPendingTasks {...props} />);
  expect(state.queryArgs).toEqual({
    classIds: props.classIds,
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
  vi.unstubAllGlobals();
});

test("links pending work to its course and removes it after submission", () => {
  const props = {
    classIds: ["class-1", "class-2"] as Id<"classes">[],
    now: 100,
    orgSlug: "campus",
  };
  const view = render(<StudentPendingTasks {...props} />);
  expect(
    screen.getByRole("link", { name: /Draw a cell/ }).getAttribute("href"),
  ).toBe("/campus/classes/class-1?task=task-1");
  expect(screen.getByText("instructions:")).toBeTruthy();
  expect(screen.getByText("Label each part")).toBeTruthy();
  expect(screen.getAllByText("deadlineLabel")).toHaveLength(2);
  expect(screen.getByText("200")).toBeTruthy();
  expect(screen.getByText("noDeadline")).toBeTruthy();
  view.rerender(<StudentPendingTasks {...props} now={300} />);
  expect(screen.getByText("200")).toBeTruthy();
  expect(screen.queryByText(/dashboardLateAllowed/)).toBeNull();
  for (const card of screen.getAllByRole("link")) {
    expect(card.classList.contains("border-secondary/60")).toBe(true);
    expect(card.classList.contains("hover:bg-muted/40")).toBe(true);
  }

  state.tasks = [];
  view.rerender(<StudentPendingTasks {...props} />);
  expect(screen.queryByText("Draw a cell")).toBeNull();
  expect(screen.getByText("dashboardEmpty")).toBeTruthy();
});
