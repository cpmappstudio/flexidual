import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CalendarManageEventDialog from "@/components/calendar/dialog/calendar-manage-event-dialog";

const testState = vi.hoisted(() => ({
  reopenedSession: undefined as { status: string; isLive: boolean } | undefined,
  reopenLiveSession: vi.fn(async () => null),
  router: { push: vi.fn() },
  setManageEventDialogOpen: vi.fn(),
  setSelectedEvent: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    schedule: {
      cancelSchedule: "cancelSchedule",
      reopenLiveSession: "reopenLiveSession",
      getSessionStatus: "getSessionStatus",
    },
  },
}));
vi.mock("convex/react", () => ({
  useMutation: (name: string) =>
    name === "reopenLiveSession" ? testState.reopenLiveSession : vi.fn(),
  useQuery: (_name: string, args: unknown) =>
    args === "skip" ? undefined : testState.reopenedSession,
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "school" }),
  useRouter: () => testState.router,
}));
vi.mock("next/image", () => ({
  default: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: testState.toastError } }));
vi.mock("@/hooks/use-current-minute", () => ({
  useCurrentMinute: () => Date.UTC(2026, 9, 2, 12, 1),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/classroom/session-record", () => ({
  useSessionRecord: () => null,
  getSessionRecordings: () => [],
  SessionRecordView: () => null,
}));
vi.mock("@/components/classroom/session-closeout-dialog", () => ({
  SessionCloseoutDialog: () => null,
}));
vi.mock("@/components/classroom/session-closure-progress", () => ({
  SessionClosureProgress: () => null,
}));
vi.mock("@/components/recording-player-modal", () => ({
  RecordingPlayerModal: () => null,
}));
vi.mock("@/components/calendar/calendar-event-display", () => ({
  getCalendarEventDisplay: () => ({
    primaryLabel: "NASA",
    secondaryLabel: "Teacher",
    gradeLabel: "9th Grade",
  }),
}));
vi.mock("@/components/calendar/calendar-provider-badge", () => ({
  CalendarProviderBadge: () => null,
}));
vi.mock("@/components/calendar/calendar-cancellation", () => ({
  getCalendarCancellationCapabilities: () => ({
    canCancelOccurrence: false,
    canCancelSeries: false,
  }),
}));
vi.mock("@/components/calendar/calendar-context", () => ({
  useCalendarContext: () => ({
    manageEventDialogOpen: true,
    setManageEventDialogOpen: testState.setManageEventDialogOpen,
    selectedEvent: {
      scheduleId: "schedule-1",
      roomName: "room-1",
      classId: "class-1",
      title: "NASA",
      start: new Date(Date.UTC(2026, 9, 2, 12)),
      end: new Date(Date.UTC(2026, 9, 2, 12, 5)),
      status: "completed",
      isLive: false,
      sessionType: "live",
      canLeadSession: true,
      sessionStartedAt: Date.UTC(2026, 9, 2, 12),
      sessionReopenUntil: Date.UTC(2026, 9, 2, 12, 15),
      isRecurring: false,
    },
    setSelectedEvent: testState.setSelectedEvent,
    displayTimeZone: "UTC",
    isStudent: false,
    userId: "teacher-1",
  }),
}));

beforeEach(() => {
  testState.reopenedSession = undefined;
  testState.reopenLiveSession.mockReset().mockResolvedValue(null);
  testState.router.push.mockReset();
  testState.setManageEventDialogOpen.mockReset();
  testState.toastError.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("confirms reopening in the calendar and enters only after the class is active", async () => {
  testState.reopenedSession = { status: "completed", isLive: false };
  const view = render(<CalendarManageEventDialog />);

  fireEvent.click(
    screen.getByRole("button", { name: "classroom.reopenClass" }),
  );
  expect(screen.getByText("classroom.reopenClassTitle")).toBeTruthy();
  expect(testState.reopenLiveSession).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "classroom.confirmReopenClass" }),
    );
  });

  expect(testState.reopenLiveSession).toHaveBeenCalledWith({
    roomName: "room-1",
  });
  expect(testState.router.push).not.toHaveBeenCalled();

  testState.reopenedSession = { status: "active", isLive: true };
  view.rerender(<CalendarManageEventDialog />);

  expect(testState.router.push).toHaveBeenCalledWith(
    "/school/classroom/room-1",
  );
  expect(testState.setManageEventDialogOpen).toHaveBeenCalledWith(false);
});

it("lets the leader cancel before reopening", () => {
  render(<CalendarManageEventDialog />);

  fireEvent.click(
    screen.getByRole("button", { name: "classroom.reopenClass" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));

  expect(screen.queryByText("classroom.reopenClassTitle")).toBeNull();
  expect(testState.reopenLiveSession).not.toHaveBeenCalled();
});

it("explains a delayed entry without claiming that reopening failed", async () => {
  const timeoutSpy = vi.spyOn(window, "setTimeout");
  const view = render(<CalendarManageEventDialog />);

  fireEvent.click(
    screen.getByRole("button", { name: "classroom.reopenClass" }),
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "classroom.confirmReopenClass" }),
    );
  });

  const delayedEntry = timeoutSpy.mock.calls.find(
    ([, delay]) => delay === 10_000,
  )?.[0];
  expect(typeof delayedEntry).toBe("function");
  act(() => {
    if (typeof delayedEntry === "function") delayedEntry();
  });

  expect(screen.getByText("classroom.reopenClassDelayed")).toBeTruthy();
  expect(testState.toastError).not.toHaveBeenCalled();
  expect(testState.reopenLiveSession).toHaveBeenCalledOnce();
  expect(testState.router.push).not.toHaveBeenCalled();

  testState.reopenedSession = { status: "active", isLive: true };
  view.rerender(<CalendarManageEventDialog />);
  expect(testState.router.push).toHaveBeenCalledWith(
    "/school/classroom/room-1",
  );
});

it("keeps the calendar open if reopening fails", async () => {
  testState.reopenLiveSession.mockRejectedValueOnce(new Error("expired"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  render(<CalendarManageEventDialog />);

  fireEvent.click(
    screen.getByRole("button", { name: "classroom.reopenClass" }),
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "classroom.confirmReopenClass" }),
    );
  });

  expect(testState.router.push).not.toHaveBeenCalled();
  expect(testState.toastError).toHaveBeenCalledWith(
    "classroom.reopenClassError",
  );
  expect(screen.getByText("classroom.reopenClassTitle")).toBeTruthy();
});
