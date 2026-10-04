import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const removeTask = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const successToast = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());

const tasks = vi.hoisted(() => [
  {
    _id: "scheduled",
    title: "Scheduled assignment",
    availableAt: 400,
    isDraft: false,
  },
  {
    _id: "latest",
    title: "Newest published assignment",
    releasedAt: 300,
    isDraft: false,
  },
  {
    _id: "earlier",
    title: "Earlier published assignment",
    releasedAt: 100,
    dueAt: 500,
    isDraft: false,
  },
]);

vi.mock("convex/react", () => ({
  useMutation: () => removeTask,
  usePaginatedQuery: () => ({
    results: tasks,
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: successToast, error: errorToast },
}));

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
  useTranslations: () => (key: string, values?: { date: string }) =>
    values ? `${key} ${values.date}` : key,
}));

vi.mock("@/components/teaching/classes/course-task-detail", () => ({
  CourseTaskDetail: ({
    taskId,
    onDelete,
  }: {
    taskId: string;
    onDelete: (task: Doc<"courseTasks">) => void;
  }) => (
    <div>
      selected:{taskId}
      <button
        type="button"
        onClick={() =>
          onDelete(
            tasks.find((task) => task._id === taskId) as Doc<"courseTasks">,
          )
        }
      >
        requestDelete
      </button>
    </div>
  ),
}));

vi.mock("@/components/teaching/classes/course-task-editor", () => ({
  CourseTaskEditor: () => null,
}));

import { CourseTasksTab } from "@/components/teaching/classes/course-tasks-tab";

beforeEach(() => {
  removeTask.mockClear();
  successToast.mockClear();
  errorToast.mockClear();
  window.history.replaceState(null, "", "/");
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows earlier availability on the left and selects the latest on the right", () => {
  render(
    <CourseTasksTab
      classId={"class-id" as Id<"classes">}
      canManage
      timeZone="UTC"
    />,
  );

  const cards = screen
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("aria-pressed"));
  expect(cards.map((card) => card.textContent)).toEqual([
    "Earlier published assignmentavailableOn 100deadline 500",
    "Newest published assignmentavailableOn 300noDeadline",
    "Scheduled assignmentavailableOn 400noDeadline",
  ]);
  expect(cards[2].getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("selected:scheduled")).toBeTruthy();
  expect(screen.getByRole("button", { name: "olderTasks" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "newerTasks" })).toBeTruthy();
  expect(screen.getByText("olderTasks")).toBeTruthy();
  expect(screen.getByText("newerTasks")).toBeTruthy();

  fireEvent.click(cards[1]);
  expect(screen.getByText("selected:latest")).toBeTruthy();
  expect(cards[1].getAttribute("aria-pressed")).toBe("true");
});

test("resets a deep-linked selection when entering assignments manually", () => {
  const props = {
    classId: "class-id" as Id<"classes">,
    canManage: true,
    timeZone: "UTC",
  };
  const { rerender } = render(
    <CourseTasksTab
      {...props}
      initialTaskId={"earlier" as Id<"courseTasks">}
    />,
  );
  expect(screen.getByText("selected:earlier")).toBeTruthy();

  rerender(<CourseTasksTab {...props} />);
  expect(screen.getByText("selected:scheduled")).toBeTruthy();
});

test("requires confirmation before deleting and selects another assignment afterward", async () => {
  window.history.replaceState(null, "", "/?task=scheduled");
  render(
    <CourseTasksTab
      classId={"class-id" as Id<"classes">}
      canManage
      timeZone="UTC"
      initialTaskId={"scheduled" as Id<"courseTasks">}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "requestDelete" }));
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toBeTruthy();
  const footer = dialog.querySelector('[data-slot="alert-dialog-footer"]');
  expect(footer?.classList.contains("flex-col")).toBe(true);
  expect(footer?.classList.contains("sm:flex-row")).toBe(true);
  expect(
    screen.getByText("Scheduled assignment", { selector: "p" }),
  ).toBeTruthy();
  expect(screen.getByText("deleteConfirmConsequences")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(removeTask).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "requestDelete" }));
  fireEvent.click(screen.getByRole("button", { name: "deleteTask" }));
  await waitFor(() =>
    expect(removeTask).toHaveBeenCalledWith({ taskId: "scheduled" }),
  );
  await waitFor(() => expect(screen.getByText("selected:latest")).toBeTruthy());
  expect(window.location.search).toBe("");
  expect(successToast).toHaveBeenCalledWith("deleteSuccess");
  expect(screen.queryByText("Scheduled assignment")).toBeNull();
});

test("keeps the confirmation open when deletion fails", async () => {
  removeTask.mockRejectedValueOnce(new Error("network"));
  render(
    <CourseTasksTab
      classId={"class-id" as Id<"classes">}
      canManage
      timeZone="UTC"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "requestDelete" }));
  fireEvent.click(screen.getByRole("button", { name: "deleteTask" }));
  await waitFor(() => expect(errorToast).toHaveBeenCalledWith("deleteFailed"));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(screen.getByText("selected:scheduled")).toBeTruthy();
});
