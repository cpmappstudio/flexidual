import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  submit: vi.fn(async () => null),
  context: {
    scheduleId: "schedule-1",
    className: "Course",
    canClose: true,
    closureStatus: "pending",
    lessons: [],
    attendance: [],
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
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => "date" }),
}));

import { SessionCloseoutDialog } from "@/components/classroom/session-closeout-dialog";

beforeEach(() => {
  vi.clearAllMocks();
  state.submit.mockResolvedValue(null);
  vi.stubGlobal(
    "ResizeObserver",
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
