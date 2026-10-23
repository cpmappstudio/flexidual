import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  submit: vi.fn<
    (args: {
      attendance: Array<{
        studentId: string;
        status: string;
        excuseReason?: string;
      }>;
    }) => Promise<null>
  >(async () => null),
  context: {
    scheduleId: "schedule-1",
    className: "Course",
    canClose: true,
    closureStatus: "pending" as "pending" | "completed",
    lessons: [],
    attendance: [] as Array<{
      studentId: string;
      fullName: string;
      totalMinutes: number;
      status: "present" | "partial" | "absent" | "excused";
      suggestedStatus: "present" | "partial" | "absent";
      excuseReason?: string;
    }>,
    notes: "",
  },
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    schedule: {
      getSessionClosureContext: "context",
      submitSessionClosure: "submit",
    },
  },
}));
vi.mock("convex/react", () => ({
  useMutation: () => state.submit,
  useQuery: (_query: unknown, args: unknown) =>
    args === "skip" ? undefined : state.context,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    key === "markAllPresentConfirmDescription"
      ? `${key}:${values?.count}`
      : key,
  useFormatter: () => ({ dateTime: () => "date" }),
}));

import { SessionCloseoutDialog } from "@/components/classroom/session-closeout-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  state.submit.mockResolvedValue(null);
  state.context.closureStatus = "pending";
  state.context.attendance = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const students = [
  {
    studentId: "student-1",
    fullName: "Ana",
    totalMinutes: 0,
    status: "absent" as const,
    suggestedStatus: "absent" as const,
  },
  {
    studentId: "student-2",
    fullName: "Beto",
    totalMinutes: 20,
    status: "partial" as const,
    suggestedStatus: "partial" as const,
  },
  {
    studentId: "student-3",
    fullName: "Cora",
    totalMinutes: 60,
    status: "present" as const,
    suggestedStatus: "present" as const,
  },
];

async function openAttendance(overrides = {}) {
  const props = {
    open: true,
    roomName: "room-1",
    sessionNow: Date.now(),
    onOpenChange: vi.fn(),
    onComplete: vi.fn(),
    ...overrides,
  };
  const view = render(createElement(SessionCloseoutDialog, props));
  await waitFor(() => expect(screen.queryByText("noLessons")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  return { ...view, props };
}

function attendanceStatus(name: string, status: string) {
  const row = screen.getByText(name).closest(".grid") as HTMLElement;
  return within(row).getByRole("radio", { name: status });
}

function requestAllPresent() {
  fireEvent.click(screen.getByRole("checkbox", { name: "markAllPresent" }));
}

function confirmAllPresent() {
  fireEvent.click(
    screen.getByRole("button", { name: "markAllPresentConfirmAction" }),
  );
}
afterEach(() => {
  cleanup();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  vi.unstubAllGlobals();
});

it("keeps a required draft across stream closure and blocks dismissing it", async () => {
  const onOpenChange = vi.fn();
  const onComplete = vi.fn();
  const props = {
    open: true,
    roomName: "room-1",
    sessionNow: Date.now(),
    required: true,
    onOpenChange,
    onComplete,
  };
  const view = render(createElement(SessionCloseoutDialog, props));
  await waitFor(() => expect(screen.queryByText("noLessons")).toBeTruthy());
  const notes = screen.getByRole("textbox", { name: "notesTitle" });
  fireEvent.change(notes, {
    target: { value: "Draft before automatic closure" },
  });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "cancel" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

  view.rerender(
    createElement(SessionCloseoutDialog, {
      ...props,
      alreadyEnded: true,
      sessionNow: props.sessionNow + 300_000,
    }),
  );
  expect(
    (screen.getByRole("textbox", { name: "notesTitle" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Draft before automatic closure");
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  fireEvent.click(screen.getByRole("button", { name: "recoverySubmit" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  expect(state.submit).toHaveBeenCalledWith({
    roomName: "room-1",
    notes: "Draft before automatic closure",
    lessonIds: [],
    attendance: [],
  });
});

it("offers reopening without dismissing a required closeout", () => {
  const onReopen = vi.fn();
  const onOpenChange = vi.fn();
  const view = render(
    createElement(SessionCloseoutDialog, {
      open: true,
      roomName: "room-1",
      sessionNow: Date.now(),
      required: true,
      alreadyEnded: true,
      onOpenChange,
      onComplete: vi.fn(),
      onReopen,
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "reopenClass" }));
  expect(onReopen).toHaveBeenCalledOnce();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

  view.rerender(
    createElement(SessionCloseoutDialog, {
      open: true,
      roomName: "room-1",
      sessionNow: Date.now(),
      required: true,
      alreadyEnded: true,
      isReopening: true,
      onOpenChange,
      onComplete: vi.fn(),
      onReopen,
    }),
  );
  expect(
    (screen.getByRole("button", { name: "reopenClass" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("keeps errors retryable and does not save the report twice when ending fails", async () => {
  const onComplete = vi
    .fn()
    .mockRejectedValueOnce(new Error("end failed"))
    .mockResolvedValue(undefined);
  render(
    createElement(SessionCloseoutDialog, {
      open: true,
      roomName: "room-1",
      sessionNow: Date.now(),
      required: true,
      onOpenChange: vi.fn(),
      onComplete,
    }),
  );
  await waitFor(() => expect(screen.queryByText("noLessons")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("submitError"),
  );
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
  expect(state.submit).toHaveBeenCalledTimes(1);
});

it("keeps the existing calendar recovery dialog dismissible", () => {
  const onOpenChange = vi.fn();
  render(
    createElement(SessionCloseoutDialog, {
      open: true,
      roomName: "room-1",
      sessionNow: Date.now(),
      alreadyEnded: true,
      onOpenChange,
      onComplete: vi.fn(),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("allows a manually opened live closeout to be dismissed from any step", () => {
  const fullscreenRoot = document.createElement("div");
  document.body.append(fullscreenRoot);
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: fullscreenRoot,
  });
  const onOpenChange = vi.fn();
  render(
    createElement(SessionCloseoutDialog, {
      open: true,
      roomName: "room-1",
      sessionNow: Date.now(),
      onOpenChange,
      onComplete: vi.fn(),
    }),
    { container: fullscreenRoot },
  );

  expect(fullscreenRoot.contains(screen.getByRole("dialog"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("confirms before changing the draft and submits every student as present", async () => {
  state.context.attendance = [...students];
  await openAttendance();

  expect(
    screen
      .getByRole("checkbox", { name: "markAllPresent" })
      .getAttribute("data-state"),
  ).toBe("unchecked");
  expect(
    attendanceStatus("Ana", "status.absent").getAttribute("data-state"),
  ).toBe("on");
  requestAllPresent();
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(
    attendanceStatus("Beto", "status.partial").getAttribute("data-state"),
  ).toBe("on");

  requestAllPresent();
  confirmAllPresent();
  expect(state.submit).not.toHaveBeenCalled();
  for (const student of students) {
    expect(
      attendanceStatus(student.fullName, "status.present").getAttribute(
        "data-state",
      ),
    ).toBe("on");
  }
  expect(
    screen
      .getByRole("checkbox", { name: "markAllPresent" })
      .getAttribute("data-state"),
  ).toBe("checked");
  const restoreButton = screen.getByRole("button", {
    name: "restoreSuggestions",
  });
  expect(restoreButton.previousElementSibling?.tagName).toBe("LABEL");
  expect(restoreButton.querySelector(".lucide-rotate-ccw")).toBeTruthy();
  expect(restoreButton.className).toContain("border");
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(state.submit).toHaveBeenCalledOnce());
  expect(state.submit.mock.calls[0][0].attendance).toEqual(
    students.map((student) => ({
      studentId: student.studentId,
      status: "present",
      excuseReason: undefined,
    })),
  );
});

it("applies to hidden students and restores system suggestions after manual changes", async () => {
  state.context.attendance = [...students];
  await openAttendance();
  fireEvent.change(screen.getByPlaceholderText("searchStudents"), {
    target: { value: "Ana" },
  });
  expect(screen.queryByText("Beto")).toBeNull();
  requestAllPresent();
  expect(screen.getByText("markAllPresentConfirmDescription:3")).toBeTruthy();
  confirmAllPresent();
  fireEvent.change(screen.getByPlaceholderText("searchStudents"), {
    target: { value: "" },
  });
  expect(
    attendanceStatus("Beto", "status.present").getAttribute("data-state"),
  ).toBe("on");

  fireEvent.click(attendanceStatus("Ana", "status.excused"));
  fireEvent.change(screen.getByPlaceholderText("excuseReasonPlaceholder"), {
    target: { value: "Medical appointment" },
  });
  expect(
    screen
      .getByRole("checkbox", { name: "markAllPresent" })
      .getAttribute("data-state"),
  ).toBe("unchecked");
  requestAllPresent();
  fireEvent.click(screen.getByRole("button", { name: "cancel" }));
  expect(
    attendanceStatus("Ana", "status.excused").getAttribute("data-state"),
  ).toBe("on");
  fireEvent.click(screen.getByRole("button", { name: "restoreSuggestions" }));
  expect(screen.queryByPlaceholderText("excuseReasonPlaceholder")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("checkbox", { name: "markAllPresent" }),
  );
  expect(
    screen.queryByRole("button", { name: "restoreSuggestions" }),
  ).toBeNull();
  for (const student of students) {
    expect(
      attendanceStatus(
        student.fullName,
        `status.${student.suggestedStatus}`,
      ).getAttribute("data-state"),
    ).toBe("on");
  }
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(state.submit).toHaveBeenCalledOnce());
  expect(state.submit.mock.calls[0][0].attendance).toEqual(
    students.map((student) => ({
      studentId: student.studentId,
      status: student.suggestedStatus,
      excuseReason: undefined,
    })),
  );
});

it("discards earlier manual overrides when suggestions are restored", async () => {
  state.context.attendance = [...students];
  await openAttendance();
  fireEvent.click(attendanceStatus("Ana", "status.partial"));
  requestAllPresent();
  confirmAllPresent();
  fireEvent.click(screen.getByRole("button", { name: "restoreSuggestions" }));
  expect(
    attendanceStatus("Ana", "status.absent").getAttribute("data-state"),
  ).toBe("on");
});

it("restores suggestions when the checked bulk control is unchecked", async () => {
  state.context.attendance = [...students];
  await openAttendance();
  requestAllPresent();
  confirmAllPresent();
  requestAllPresent();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(
    attendanceStatus("Ana", "status.absent").getAttribute("data-state"),
  ).toBe("on");
  expect(
    screen.queryByRole("button", { name: "restoreSuggestions" }),
  ).toBeNull();
});

it("clears an existing excuse reason when marking or restoring suggestions", async () => {
  state.context.attendance = [
    {
      ...students[0],
      status: "excused",
      excuseReason: "Prior reason",
    },
  ];
  await openAttendance();
  expect(
    (
      screen.getByPlaceholderText(
        "excuseReasonPlaceholder",
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("Prior reason");
  requestAllPresent();
  confirmAllPresent();
  expect(screen.queryByPlaceholderText("excuseReasonPlaceholder")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "restoreSuggestions" }));
  expect(
    attendanceStatus("Ana", "status.absent").getAttribute("data-state"),
  ).toBe("on");
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(state.submit).toHaveBeenCalledOnce());
  expect(state.submit.mock.calls[0][0].attendance).toEqual([
    { studentId: "student-1", status: "absent", excuseReason: undefined },
  ]);
});

it("keeps the bulk draft retryable when saving fails", async () => {
  state.context.attendance = [...students];
  state.submit.mockRejectedValueOnce(new Error("save failed"));
  await openAttendance();
  requestAllPresent();
  confirmAllPresent();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("submitError"),
  );
  expect(
    screen
      .getByRole("checkbox", { name: "markAllPresent" })
      .getAttribute("data-state"),
  ).toBe("checked");
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() => expect(state.submit).toHaveBeenCalledTimes(2));
  expect(state.submit.mock.calls[1][0].attendance).toEqual(
    students.map((student) => ({
      studentId: student.studentId,
      status: "present",
      excuseReason: undefined,
    })),
  );
});

it("does not offer the bulk action when no students are enrolled", async () => {
  await openAttendance();
  expect(screen.queryByRole("checkbox", { name: "markAllPresent" })).toBeNull();
});

it("does not open bulk confirmation while the session is reopening", async () => {
  state.context.attendance = [...students];
  await openAttendance({ isReopening: true });
  const checkbox = screen.getByRole("checkbox", { name: "markAllPresent" });
  expect((checkbox as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("resets a pending confirmation when the session changes", async () => {
  state.context.attendance = [...students];
  const view = await openAttendance();
  requestAllPresent();
  expect(screen.getByRole("alertdialog")).toBeTruthy();

  state.context.attendance = [students[2]];
  view.rerender(
    createElement(SessionCloseoutDialog, {
      ...view.props,
      roomName: "room-2",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.queryByRole("checkbox", { name: "markAllPresent" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  expect(screen.getByText("Cora")).toBeTruthy();
  expect(screen.queryByText("Ana")).toBeNull();
  expect(
    screen
      .getByRole("checkbox", { name: "markAllPresent" })
      .getAttribute("data-state"),
  ).toBe("unchecked");
});

it("resets the bulk draft when the closeout is dismissed and opened again", async () => {
  state.context.attendance = [...students];
  const view = await openAttendance();
  requestAllPresent();
  confirmAllPresent();
  view.rerender(
    createElement(SessionCloseoutDialog, { ...view.props, open: false }),
  );
  view.rerender(createElement(SessionCloseoutDialog, view.props));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "continueToAttendance" }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  expect(
    attendanceStatus("Ana", "status.absent").getAttribute("data-state"),
  ).toBe("on");
  expect(
    screen
      .getByRole("checkbox", { name: "markAllPresent" })
      .getAttribute("data-state"),
  ).toBe("unchecked");
  expect(
    screen.queryByRole("button", { name: "restoreSuggestions" }),
  ).toBeNull();
});

it("keeps bulk confirmation inside the fullscreen classroom", async () => {
  state.context.attendance = [...students];
  const fullscreenRoot = document.createElement("div");
  document.body.append(fullscreenRoot);
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: fullscreenRoot,
  });
  render(
    createElement(SessionCloseoutDialog, {
      open: true,
      roomName: "room-1",
      sessionNow: Date.now(),
      onOpenChange: vi.fn(),
      onComplete: vi.fn(),
    }),
    { container: fullscreenRoot },
  );
  await waitFor(() => expect(screen.queryByText("noLessons")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  requestAllPresent();
  expect(fullscreenRoot.contains(screen.getByRole("alertdialog"))).toBe(true);
});

it("hides the bulk action for saved reports and after a successful save", async () => {
  state.context.attendance = [...students];
  state.context.closureStatus = "completed";
  const view = await openAttendance();
  expect(screen.queryByRole("checkbox", { name: "markAllPresent" })).toBeNull();
  view.unmount();

  state.context.closureStatus = "pending";
  let resolveSave!: () => void;
  state.submit.mockImplementationOnce(
    () =>
      new Promise<null>((resolve) => {
        resolveSave = () => resolve(null);
      }),
  );
  const onComplete = vi.fn().mockRejectedValue(new Error("end failed"));
  await openAttendance({ onComplete });
  requestAllPresent();
  confirmAllPresent();
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  expect(
    (
      screen.getByRole("checkbox", {
        name: "markAllPresent",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  expect(state.submit).toHaveBeenCalledOnce();
  resolveSave();
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("submitError"),
  );
  expect(screen.queryByRole("checkbox", { name: "markAllPresent" })).toBeNull();
});
