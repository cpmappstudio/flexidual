import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const mutations = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  discardUnpublished: vi.fn(),
  cancelStaged: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const previewQuery = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: async () => "test-token" }),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvex: () => ({ query: previewQuery }),
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref).split(":")[1];
      const mutation = mutations[name as keyof typeof mutations];
      if (!mutation) throw new Error(`Unexpected mutation: ${name}`);
      return mutation;
    },
  };
});

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}: ${Object.values(values).join(" ")}` : key,
}));

vi.mock("sonner", () => ({ toast }));

import { CourseTaskEditor } from "@/components/teaching/classes/course-task-editor";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  mutations.create.mockResolvedValue("task-id");
  mutations.update.mockResolvedValue(null);
  mutations.publish.mockResolvedValue(null);
  mutations.discardUnpublished.mockResolvedValue("discarded");
  mutations.cancelStaged.mockResolvedValue(null);
  previewQuery.mockResolvedValue({ hasSubmissions: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function renderEditor(onSaved = vi.fn()) {
  const view = render(
    <CourseTaskEditor
      classId={"class-id" as Id<"classes">}
      materials={[]}
      timeZone="UTC"
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );
  fireEvent.change(view.container.ownerDocument.querySelector("#task-title")!, {
    target: { value: "Essay" },
  });
  return { ...view, onSaved };
}

function renderPublishedEditor(overrides: Partial<Doc<"courseTasks">> = {}) {
  const task = {
    _id: "task-id",
    _creationTime: Date.UTC(2020, 0, 1),
    classId: "class-id",
    createdBy: "teacher-id",
    title: "Essay",
    releasedAt: Date.UTC(2020, 0, 1),
    dueAt: Date.UTC(2099, 0, 1),
    allowLateSubmissions: false,
    updatedAt: Date.UTC(2020, 0, 1),
    ...overrides,
  } as Doc<"courseTasks">;
  return render(
    <CourseTaskEditor
      classId={"class-id" as Id<"classes">}
      task={task}
      materials={[]}
      timeZone="UTC"
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
}

test("keeps the form and names a rejected file without publishing a task", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "INVALID_TASK_FILE" }, { status: 400 }),
      ),
  );
  const { onSaved } = renderEditor();
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(["pdf"], "essay.pdf")] },
  });
  await waitFor(() => expect(screen.getByText("essay.pdf")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "publish" }));

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("essay.pdf"),
  );
  expect(screen.getByRole("alert").textContent).toContain("fileRejected");
  expect(mutations.discardUnpublished).toHaveBeenCalledWith({
    taskId: "task-id",
  });
  expect(mutations.publish).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "publish" })).not.toHaveProperty(
    "disabled",
    true,
  );
});

test("a later upload failure cancels earlier staged files and never publishes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "uploaded-file-id" }))
      .mockResolvedValueOnce(
        Response.json({ error: "INVALID_TASK_FILE" }, { status: 400 }),
      ),
  );
  const { onSaved } = renderEditor();
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: {
      files: [
        new File(["first"], "first.pdf"),
        new File(["second"], "second.pdf"),
      ],
    },
  });
  await waitFor(() => expect(screen.getByText("second.pdf")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "publish" }));

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("second.pdf"),
  );
  expect(mutations.cancelStaged).toHaveBeenCalledWith({
    id: "uploaded-file-id",
  });
  expect(mutations.discardUnpublished).toHaveBeenCalledWith({
    taskId: "task-id",
  });
  expect(mutations.publish).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
});

test("a lost publish response checks the server result before offering a retry", async () => {
  mutations.publish.mockRejectedValueOnce(new TypeError("Network error"));
  mutations.discardUnpublished.mockResolvedValueOnce("published");
  const { onSaved } = renderEditor();
  fireEvent.click(screen.getByRole("button", { name: "publish" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("task-id"));
  expect(toast.success).toHaveBeenCalledWith("created");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mutations.create).toHaveBeenCalledTimes(1);
});

test("labels a future start as scheduling and confirms it only after publication", async () => {
  const { onSaved } = renderEditor();
  fireEvent.change(document.querySelector("#task-start")!, {
    target: { value: "2099-01-01T10:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "scheduleTask" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("task-id"));
  expect(mutations.publish).toHaveBeenCalledWith({
    taskId: "task-id",
    materialFileIds: [],
  });
  expect(toast.success).toHaveBeenCalledWith("scheduled");
  expect(mutations.discardUnpublished).not.toHaveBeenCalled();
});

test("explains a deadline rejected during finalization and keeps the form", async () => {
  mutations.publish.mockRejectedValueOnce({ data: "INVALID_TASK_DATES" });
  const { onSaved } = renderEditor();
  fireEvent.click(screen.getByRole("button", { name: "publish" }));

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("invalidDates"),
  );
  expect(mutations.discardUnpublished).toHaveBeenCalledWith({
    taskId: "task-id",
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>("#task-title")?.value).toBe(
    "Essay",
  );
});

test("confirms an earlier published deadline before saving and preserves existing statuses", async () => {
  renderPublishedEditor();
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2026-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));

  expect(await screen.findByText("deadlineChangeTitle")).toBeTruthy();
  expect(screen.getByText("deadlineChangeStatusesStay")).toBeTruthy();
  expect(screen.getByText("deadlineChangeClosesNow")).toBeTruthy();
  expect(screen.queryByText("deadlineChangeCounts: 2 3")).toBeNull();
  expect(mutations.update).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: "deadlineChangeConfirm" }),
  );
  await waitFor(() =>
    expect(mutations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-id",
        dueAt: Date.UTC(2026, 0, 1, 12),
      }),
    ),
  );
});

test("rejects a past deadline when creating an assignment", () => {
  renderEditor();
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2020-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "publish" }));
  expect(screen.getByRole("alert").textContent).toBe("invalidDates");
  expect(mutations.create).not.toHaveBeenCalled();
});

test("explains immediate publication and disables late submissions by default", async () => {
  renderEditor();
  expect(screen.getByText("immediateStartHint")).toBeTruthy();
  expect(screen.getByText("noDeadlineHint")).toBeTruthy();
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2099-01-01T12:00" },
  });
  expect(screen.getByText("deadlineHint")).toBeTruthy();
  expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe(
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "publish" }));
  await waitFor(() => expect(mutations.create).toHaveBeenCalled());
  expect(mutations.create).toHaveBeenCalledWith(
    expect.objectContaining({ allowLateSubmissions: false }),
  );
});

test("rejects an explicit past start before creating an assignment", () => {
  renderEditor();
  fireEvent.change(document.querySelector("#task-start")!, {
    target: { value: "2020-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "publish" }));
  expect(screen.getByRole("alert").textContent).toBe("invalidDates");
  expect(mutations.create).not.toHaveBeenCalled();
});

test("shows the actual locked start when editing a visible assignment", () => {
  renderPublishedEditor({ availableAt: undefined });
  expect(document.querySelector("#task-start")).toBeNull();
  expect(screen.getByText("releasedStartHint")).toBeTruthy();
  expect(screen.getByText(String(Date.UTC(2020, 0, 1)))).toBeTruthy();
});

test("labels clearing a scheduled start as publishing now", async () => {
  renderPublishedEditor({
    releasedAt: undefined,
    availableAt: Date.UTC(2099, 0, 1, 10),
  });
  expect(screen.getByText("scheduledStartHint")).toBeTruthy();
  fireEvent.change(document.querySelector("#task-start")!, {
    target: { value: "" },
  });
  expect(screen.getByText("immediateStartHint")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "publish" }));
  await waitFor(() =>
    expect(mutations.update).toHaveBeenCalledWith(
      expect.objectContaining({ availableAt: null }),
    ),
  );
});

test("canceling an earlier deadline leaves the assignment unchanged", async () => {
  renderPublishedEditor();
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2098-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await screen.findByText("deadlineChangeTitle");
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(screen.queryByText("deadlineChangeTitle")).toBeNull();
  expect(mutations.update).not.toHaveBeenCalled();
});

test("adding a deadline to a visible undated assignment requires confirmation when students have submitted", async () => {
  renderPublishedEditor({ dueAt: undefined });
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2098-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  expect(await screen.findByText("deadlineChangeTitle")).toBeTruthy();
  expect(screen.getByText("noDeadline")).toBeTruthy();
  expect(mutations.update).not.toHaveBeenCalled();
});

test("saves a new deadline directly when nobody has submitted", async () => {
  previewQuery.mockResolvedValue({ hasSubmissions: false });
  renderPublishedEditor({ dueAt: undefined });
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2098-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));

  await waitFor(() => expect(mutations.update).toHaveBeenCalledTimes(1));
  expect(previewQuery).toHaveBeenCalledWith(expect.anything(), {
    taskId: "task-id",
  });
  expect(screen.queryByText("deadlineChangeTitle")).toBeNull();
});

test("does not save if the submission check fails", async () => {
  previewQuery.mockRejectedValue(new Error("Network error"));
  renderPublishedEditor({ dueAt: undefined });
  fireEvent.change(document.querySelector("#task-due")!, {
    target: { value: "2098-01-01T12:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "save" }));

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("saveError"),
  );
  expect(mutations.update).not.toHaveBeenCalled();
  expect(screen.queryByText("deadlineChangeTitle")).toBeNull();
});
