import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";

const rows = vi.hoisted(() =>
  Array.from({ length: 30 }, (_, index) => ({
    studentId: `student-${index}`,
    studentName: `Student ${index}`,
    submittedAt: index === 1 || index === 2 ? 1_000 + index : undefined,
    submittedLate: index === 2,
    submissionRevision: index === 1 || index === 2 ? 1 : 0,
    hasFeedback: false,
  })),
);
const detailState = vi.hoisted(() => ({
  task: {
    _id: "task-id",
    classId: "class-id",
    _creationTime: 500,
    updatedAt: 750,
    title: "Assignment",
    releasedAt: 800,
  } as Record<string, unknown>,
  status: {
    canManage: true,
    canSubmit: false,
    submissionsOpen: true,
    canReopen: false,
  },
  materials: [] as { name: string }[],
  reviewSubmission: {
    submittedAt: 1_001,
    submittedLate: false,
    files: [{ id: "file-1", name: "Trabajo_de_Grado.pdf" }],
    feedback: undefined,
  } as {
    submittedAt: number | undefined;
    submittedLate: boolean;
    files: { id: string; name: string }[];
    feedback?: { text: string; updatedAt: number };
  },
}));
const feedbackMutation = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const uploadFiles = vi.hoisted(() => vi.fn());
const mobileState = vi.hoisted(() => ({ isMobile: false }));
const queryState = vi.hoisted(() => ({
  now: 1_000,
  statusNow: 0,
  statusLoading: false,
}));

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (value: number) => String(value) }),
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-current-time", () => ({
  useCurrentTime: () => queryState.now,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mobileState.isMobile,
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: unknown, args?: { now?: number }) => {
      switch (getFunctionName(ref as Parameters<typeof getFunctionName>[0])) {
        case "courseTasks:get":
          return detailState.task;
        case "courseTasks:getStatus":
          queryState.statusNow = args?.now ?? 0;
          return queryState.statusLoading ? undefined : detailState.status;
        case "courseTaskFiles:listMaterials":
          return detailState.materials;
        case "courseTaskSubmissions:get":
          return detailState.reviewSubmission;
        default:
          throw new Error("Unexpected query");
      }
    },
    useMutation: (ref: unknown) =>
      getFunctionName(ref as Parameters<typeof getFunctionName>[0]) ===
      "courseTaskSubmissions:setFeedback"
        ? feedbackMutation
        : vi.fn(),
    usePaginatedQuery: () => ({
      results: rows,
      status: "Exhausted",
      loadMore: vi.fn(),
    }),
  };
});

vi.mock("@/components/teaching/classes/course-task-attachments", () => ({
  TaskAttachmentList: ({
    files,
    plain,
  }: {
    files: { name: string }[];
    plain?: boolean;
  }) => (
    <div data-plain={plain}>
      <span>attachments:{files.length}</span>
      {files.map((file) => (
        <span key={file.name}>{file.name}</span>
      ))}
    </div>
  ),
  TaskFilePicker: ({ onChange }: { onChange: (files: File[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          new File(["answer"], "answer.pdf", { type: "application/pdf" }),
        ])
      }
    >
      select file
    </button>
  ),
  TaskFileUploadError: class TaskFileUploadError extends Error {
    constructor(
      readonly fileName: string,
      readonly code: string,
    ) {
      super(code);
    }
  },
  TaskFileUploadStatus: () => null,
  uploadTaskFiles: uploadFiles,
  useTaskFileUploadErrorMessage:
    () => (error: { fileName: string; code: string }) =>
      `fileUploadFailed:${error.fileName}:${error.code}`,
  useTaskFileRequest: () => vi.fn(),
}));

import { CourseTaskDetail } from "@/components/teaching/classes/course-task-detail";

afterEach(() => {
  cleanup();
  detailState.task = {
    _id: "task-id",
    classId: "class-id",
    _creationTime: 500,
    updatedAt: 750,
    title: "Assignment",
    releasedAt: 800,
  };
  detailState.materials = [];
  detailState.reviewSubmission = {
    submittedAt: 1_001,
    submittedLate: false,
    files: [{ id: "file-1", name: "Trabajo_de_Grado.pdf" }],
    feedback: undefined,
  };
  feedbackMutation.mockClear();
  uploadFiles.mockReset();
  mobileState.isMobile = false;
  queryState.now = 1_000;
  queryState.statusNow = 0;
  queryState.statusLoading = false;
  detailState.status = {
    canManage: true,
    canSubmit: false,
    submissionsOpen: true,
    canReopen: false,
  };
});

test("does not evaluate a newly released task with a time before its release", () => {
  queryState.now = 700;
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(queryState.statusNow).toBe(800);
});

test("shows the delete action only to a course manager", () => {
  const onDelete = vi.fn();
  const props = {
    classId: "class-id" as Id<"classes">,
    taskId: "task-id" as Id<"courseTasks">,
    timeZone: "UTC",
    onEdit: vi.fn(),
    onDelete,
  };
  const { rerender } = render(<CourseTaskDetail {...props} />);
  const editButton = screen.getByRole("button", { name: "editTask" });
  const deleteButton = screen.getByRole("button", { name: "deleteTask" });
  expect(editButton.getAttribute("data-size")).toBe("icon-lg");
  expect(deleteButton.getAttribute("data-size")).toBe("icon-lg");
  expect(editButton.querySelector("span")?.classList.contains("hidden")).toBe(
    true,
  );
  expect(deleteButton.parentElement?.classList.contains("row-start-2")).toBe(
    true,
  );
  expect(deleteButton.parentElement?.classList.contains("sm:row-start-1")).toBe(
    true,
  );
  fireEvent.click(deleteButton);
  expect(onDelete).toHaveBeenCalledWith(detailState.task);

  detailState.status = { ...detailState.status, canManage: false };
  rerender(<CourseTaskDetail {...props} />);
  expect(screen.queryByRole("button", { name: "deleteTask" })).toBeNull();
});

test("shows every relevant empty assignment field explicitly", () => {
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByText("noDescription")).toBeTruthy();
  expect(screen.getByText("availableFrom")).toBeTruthy();
  expect(screen.getByText("800")).toBeTruthy();
  expect(screen.queryByText("publishedOn")).toBeNull();
  expect(screen.queryByText("lastUpdated")).toBeNull();
  expect(screen.getByText("noDeadline")).toBeTruthy();
  expect(screen.getByText("noDeadlineHint")).toBeTruthy();
  expect(screen.getByText("noMaterials")).toBeTruthy();
  expect(screen.getByText("visibleStatus")).toBeTruthy();
  expect(screen.queryByText("lateSubmissionsLabel")).toBeNull();
  expect(screen.queryByRole("button", { name: "closeTask" })).toBeNull();
});

test("explains that students are assigned when a scheduled task becomes visible", () => {
  detailState.task = {
    ...detailState.task,
    releasedAt: undefined,
    availableAt: 2_000,
  };
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.getByText("scheduledStatus")).toBeTruthy();
  expect(screen.getByText("studentsAssignedAtStart")).toBeTruthy();
  expect(screen.queryByText("noStudents")).toBeNull();
});

test("does not show a task from another course through a task link", () => {
  detailState.task = { ...detailState.task, classId: "another-class" };
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByText("notFound")).toBeTruthy();
  expect(screen.queryByText("Assignment")).toBeNull();
  expect(screen.queryByRole("button", { name: "editTask" })).toBeNull();
});

test("shows dates, late policy, close time, and materials when present", () => {
  detailState.task = {
    ...detailState.task,
    description: "Write a poem",
    releasedAt: 1_000,
    availableAt: 2_000,
    dueAt: 3_000,
    manuallyClosedAt: 4_000,
    allowLateSubmissions: true,
  };
  detailState.materials = [{ name: "guide.pdf" }];
  detailState.status = {
    ...detailState.status,
    submissionsOpen: false,
    canReopen: true,
  };

  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByText("Write a poem")).toBeTruthy();
  expect(screen.getByText("availableFrom")).toBeTruthy();
  expect(screen.getByText("1000")).toBeTruthy();
  expect(screen.getByText("deadlineLabel")).toBeTruthy();
  expect(
    screen.getByText("lateSubmissionsLabel:", { exact: false }),
  ).toBeTruthy();
  expect(screen.getByText("lateSubmissionsAllowed")).toBeTruthy();
  expect(
    screen.getByText("attachments:1").parentElement?.getAttribute("data-plain"),
  ).toBe("true");
  expect(screen.getByText("closedAtLabel")).toBeTruthy();
  expect(screen.getByText("4000")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "reopenTask" })).toBeNull();
});

test("uses the shared table for all loaded submissions and keeps review available", () => {
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  const headers = screen
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent);
  expect(headers).toEqual(["student", "status", "submittedAt", "actions"]);
  expect(screen.getByText("Student 29")).toBeTruthy();
  expect(screen.getAllByText("pending")).toHaveLength(28);
  expect(screen.getByText("delivered")).toBeTruthy();
  expect(screen.getByText("late")).toBeTruthy();
  expect(screen.queryByText("table.pageInfo")).toBeNull();

  const reviewButtons = screen.getAllByRole("button", { name: "review" });
  expect(reviewButtons[0].hasAttribute("disabled")).toBe(true);
  expect(reviewButtons[1].hasAttribute("disabled")).toBe(false);
  fireEvent.click(reviewButtons[1]);
  const review = screen.getByRole("dialog");
  expect(review.className).toContain("slide-in-from-right");
  expect(within(review).getByText("submissionFiles")).toBeTruthy();
  expect(within(review).getByText("Trabajo_de_Grado.pdf")).toBeTruthy();
  expect(within(review).getByText("feedbackNotSent")).toBeTruthy();
  expect(
    within(review)
      .getByText("attachments:1")
      .parentElement?.getAttribute("data-plain"),
  ).toBe("true");
  expect(
    within(review)
      .getByRole("button", { name: "sendFeedback" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test("keeps the assignment and open review visible while minute status refreshes", () => {
  const props = {
    classId: "class-id" as Id<"classes">,
    taskId: "task-id" as Id<"courseTasks">,
    timeZone: "UTC",
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  const { rerender } = render(<CourseTaskDetail {...props} />);

  fireEvent.click(screen.getAllByRole("button", { name: "review" })[1]);
  expect(screen.getByRole("dialog")).toBeTruthy();

  queryState.now = 2_000;
  queryState.statusLoading = true;
  rerender(<CourseTaskDetail {...props} />);

  expect(screen.getByText("Assignment")).toBeTruthy();
  expect(screen.getByText("visibleStatus")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();

  queryState.statusLoading = false;
  detailState.status = { ...detailState.status, submissionsOpen: false };
  rerender(<CourseTaskDetail {...props} />);

  expect(screen.getByText("closedStatus")).toBeTruthy();
  expect(screen.getByRole("dialog")).toBeTruthy();
});

test("opens the review from the bottom on mobile", () => {
  mobileState.isMobile = true;
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: "review" })[1]);
  const review = screen.getByRole("dialog");
  expect(review.className).toContain("slide-in-from-bottom");
  expect(review.className).toContain("h-[90dvh]");
});

test("shows a sent comment and enables updating it only after a change", () => {
  detailState.reviewSubmission.feedback = {
    text: "Bien hecho",
    updatedAt: 1_500,
  };
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: "review" })[1]);
  const review = screen.getByRole("dialog");
  expect(within(review).getByText("feedbackSentAt")).toBeTruthy();
  const update = within(review).getByRole("button", { name: "updateFeedback" });
  expect(update.hasAttribute("disabled")).toBe(true);

  fireEvent.change(within(review).getByLabelText("feedback"), {
    target: { value: "Excelente trabajo" },
  });
  expect(within(review).getByText("feedbackUnsaved")).toBeTruthy();
  expect(update.hasAttribute("disabled")).toBe(false);
  fireEvent.click(update);
  expect(feedbackMutation).toHaveBeenCalledWith({
    taskId: "task-id",
    studentId: "student-1",
    text: "Excelente trabajo",
  });
});

test("labels clearing an existing comment as removal", () => {
  detailState.reviewSubmission.feedback = {
    text: "Bien hecho",
    updatedAt: 1_500,
  };
  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  fireEvent.click(screen.getAllByRole("button", { name: "review" })[1]);
  const review = screen.getByRole("dialog");
  fireEvent.change(within(review).getByLabelText("feedback"), {
    target: { value: "" },
  });
  fireEvent.click(
    within(review).getByRole("button", { name: "removeFeedback" }),
  );
  expect(feedbackMutation).toHaveBeenCalledWith({
    taskId: "task-id",
    studentId: "student-1",
    text: null,
  });
});

test("opens replacement in a dialog and leaves the current submission visible", () => {
  detailState.status = {
    canManage: false,
    canSubmit: true,
    submissionsOpen: true,
    canReopen: false,
  };
  detailState.reviewSubmission.feedback = {
    text: "Te faltó el punto 1",
    updatedAt: 1_500,
  };

  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  const submission = screen
    .getByRole("heading", { name: "yourSubmission" })
    .closest("section")!;
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(within(submission).queryByText("replacementFiles")).toBeNull();
  expect(within(submission).getByText("submissionFiles")).toBeTruthy();
  expect(
    within(submission)
      .getByText("attachments:1")
      .parentElement?.getAttribute("data-plain"),
  ).toBe("true");
  expect(within(submission).getByText("teacherFeedback")).toBeTruthy();
  expect(within(submission).getByText("Te faltó el punto 1")).toBeTruthy();

  fireEvent.click(
    within(submission).getByRole("button", { name: "editSubmission" }),
  );
  const dialog = screen.getByRole("dialog");
  const picker = within(dialog).getByRole("button", {
    name: "select file",
  });
  const warning = within(dialog).getByText("replacementWarning");
  const replace = within(dialog).getByRole("button", { name: "resubmit" });

  expect(within(dialog).getByText("replacementFiles")).toBeTruthy();
  expect(warning.parentElement?.className).toContain("bg-warning/10");
  expect(
    picker.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    warning.compareDocumentPosition(replace) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(replace.hasAttribute("disabled")).toBe(true);
  fireEvent.click(picker);
  expect(replace.hasAttribute("disabled")).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(within(submission).getByText("Trabajo_de_Grado.pdf")).toBeTruthy();

  fireEvent.click(
    within(submission).getByRole("button", { name: "editSubmission" }),
  );
  expect(
    within(screen.getByRole("dialog"))
      .getByRole("button", { name: "resubmit" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

test("keeps the replacement dialog open during upload and closes after saving", async () => {
  detailState.status = {
    canManage: false,
    canSubmit: true,
    submissionsOpen: true,
    canReopen: false,
  };
  let finishUpload: ((ids: string[]) => void) | undefined;
  uploadFiles.mockImplementationOnce(
    () =>
      new Promise<string[]>((resolve) => {
        finishUpload = resolve;
      }),
  );

  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "editSubmission" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "select file" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "resubmit" }));

  expect(
    within(dialog)
      .getByRole("button", { name: "cancel" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();

  expect(finishUpload).toBeDefined();
  finishUpload!(["file-2"]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("shows only the saved submission when replacements are closed", () => {
  detailState.status = {
    canManage: false,
    canSubmit: false,
    submissionsOpen: false,
    canReopen: false,
  };

  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );

  expect(screen.getByText("submissionFiles")).toBeTruthy();
  expect(screen.getByText("submissionClosed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "editSubmission" })).toBeNull();
  expect(screen.queryByRole("button", { name: "select file" })).toBeNull();
});

test("shows the failed student file by name and keeps it available to retry", async () => {
  detailState.status = {
    canManage: false,
    canSubmit: true,
    submissionsOpen: true,
    canReopen: false,
  };
  detailState.reviewSubmission = {
    submittedAt: undefined,
    submittedLate: false,
    files: [],
    feedback: undefined,
  };
  const { TaskFileUploadError } = await import(
    "@/components/teaching/classes/course-task-attachments"
  );
  uploadFiles.mockRejectedValueOnce(
    new TaskFileUploadError("answer.pdf", "NETWORK_ERROR"),
  );

  render(
    <CourseTaskDetail
      classId={"class-id" as Id<"classes">}
      taskId={"task-id" as Id<"courseTasks">}
      timeZone="UTC"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.getByText("filesToSubmit")).toBeTruthy();
  expect(screen.queryByText("replacementWarning")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "select file" }));
  fireEvent.click(screen.getByRole("button", { name: "submit" }));

  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "fileUploadFailed:answer.pdf:NETWORK_ERROR",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "submit" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(uploadFiles).toHaveBeenCalledWith(
    [expect.objectContaining({ name: "answer.pdf" })],
    "task-id",
    "submission",
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
  );
});
