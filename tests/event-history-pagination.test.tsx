import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { EventDetail } from "@/components/events/event-detail";
import { api } from "@/convex/_generated/api";

const state = vi.hoisted(() => ({
  eventId: "event-id",
  now: 60_000,
  nextTimes: [] as number[],
  calls: [] as Array<{ category: string; now?: number }>,
  tab: "",
  recordingId: null as string | null,
  recordingTarget: null as null | {
    _id: string;
    start: number;
    end: number;
    recording: {
      _id: string;
      url: string;
      durationMs: number | null;
      startedAt: number;
    };
  },
  canEdit: false,
  activeRoom: false,
  nextRoomStatus: null as null | {
    status: "scheduled" | "active" | "completed";
    canStart: boolean;
    canReopen?: boolean;
  },
  remove: vi.fn(async () => {}),
  nextResult: null as
    | null
    | undefined
    | {
        _id: string;
        eventId: string;
        start: number;
        end: number;
        status: "active" | "scheduled" | "completed";
        roomName: string;
      },
  upcomingResults: [] as Array<{
    _id: string;
    eventId: string;
    start: number;
    end: number;
    status: "scheduled";
    roomName: string;
  }>,
  pastResults: [] as Array<{
    _id: string;
    eventId: string;
    start: number;
    end: number;
    status: "completed";
    roomName: string;
    hasRecording: boolean;
  }>,
  pastVisibleAfter: 0,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "school-a", eventId: state.eventId }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}: ${Object.values(values).join(", ")}` : key,
}));
vi.mock("@/hooks/use-current-minute", () => ({
  getCurrentMinute: () => state.now,
  useCurrentMinute: () => state.now,
}));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({ access: null }),
}));
vi.mock("@/hooks/use-event-class-conflicts", () => ({
  useEventClassConflicts: () => [],
}));
vi.mock("@/components/calendar/dialog/calendar-occurrence-dialog", () => ({
  EventOccurrenceDialog: ({
    event,
    open,
  }: {
    event: { occurrenceId: string } | null;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="event-occurrence">{event?.occurrenceId}</div>
    ) : null,
}));
vi.mock("@/components/calendar/dialog/calendar-event-form-dialog", () => ({
  CalendarEventFormDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="event-edit-form" /> : null,
}));
vi.mock("@/components/events/event-past-sessions-panel", () => ({
  EventPastSessionsPanel: ({
    sessions,
    onWatchRecording,
  }: {
    sessions: Array<{ _id: string }>;
    onWatchRecording: (session: { _id: string }) => void;
  }) => (
    <button onClick={() => onWatchRecording(sessions[0])}>
      carousel-watch
    </button>
  ),
}));
vi.mock("@/components/recording-player-modal", () => ({
  RecordingPlayerModal: ({
    occurrenceId,
    recordings,
    onOpenChange,
  }: {
    occurrenceId: string;
    recordings?: Array<{ _id: string }>;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div>
      <span data-testid="event-recording-player">{occurrenceId}</span>
      <span data-testid="target-recording">{recordings?.[0]?._id}</span>
      <button onClick={() => onOpenChange(false)}>close-player</button>
    </div>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: (
    query: FunctionReference<"query">,
    args: { now?: number } | "skip",
  ) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.events.get))
      return {
        _id: "event-id",
        schoolId: "school-id",
        title: "Assembly",
        responsibleId: "teacher-id",
        responsibleName: "Teacher",
        teacherIds: [],
        timeZone: "UTC",
        isRecurring: false,
        canManage: false,
        canEdit: state.canEdit,
      };
    if (name === getFunctionName(api.events.hasActiveRoom))
      return state.activeRoom;
    if (name === getFunctionName(api.grades.list)) return [];
    if (name === getFunctionName(api.eventRoom.getSessionStatus))
      return state.nextRoomStatus;
    if (name === getFunctionName(api.recordings.getEventRecordingTarget))
      return args === "skip" ? undefined : state.recordingTarget;
    if (
      name === getFunctionName(api.events.nextOccurrence) &&
      args !== "skip" &&
      args.now !== undefined
    ) {
      state.nextTimes.push(args.now);
      return state.nextResult;
    }
    return null;
  },
  useMutation: (mutation: FunctionReference<"mutation">) =>
    getFunctionName(mutation) === getFunctionName(api.events.remove)
      ? state.remove
      : vi.fn(),
  usePaginatedQuery: (
    _query: unknown,
    args: { category: string; now?: number },
  ) => {
    state.calls.push(args);
    return {
      results:
        args.category === "past"
          ? (args.now ?? 0) >= state.pastVisibleAfter
            ? state.pastResults
            : []
          : args.category === "upcoming"
            ? state.upcomingResults
            : [],
      status: "Exhausted",
      loadMore: vi.fn(),
    };
  },
}));

afterEach(() => {
  cleanup();
  state.eventId = "event-id";
  state.now = 60_000;
  state.nextTimes = [];
  state.calls = [];
  state.tab = "";
  state.recordingId = null;
  state.recordingTarget = null;
  state.canEdit = false;
  state.activeRoom = false;
  state.nextRoomStatus = null;
  state.remove.mockClear();
  state.nextResult = null;
  state.upcomingResults = [];
  state.pastResults = [];
  state.pastVisibleAfter = 0;
});

function EventDetailUnderTest() {
  return (
    <EventDetail
      eventId={state.eventId as Id<"events">}
      orgSlug="school-a"
      focusRecordings={state.tab === "tab=recordings"}
      recordingId={state.recordingId as Id<"recordings"> | null}
    />
  );
}

test("event management actions stay in the header and deletion is confirmed", async () => {
  const view = render(<EventDetailUnderTest />);
  expect(screen.queryByRole("button", { name: "editEvent" })).toBeNull();
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.getByRole("link", { name: "chat" }).getAttribute("href")).toBe(
    "/school-a/chats/events/event-id",
  );
  state.canEdit = true;
  view.rerender(<EventDetailUnderTest />);
  fireEvent.click(screen.getByRole("button", { name: "editEvent" }));
  expect(screen.getByTestId("event-edit-form")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "deleteEvent" }));
  const confirmation = screen.getByRole("alertdialog", {
    name: "deleteEvent",
  });
  expect(within(confirmation).getByText("deleteEventDescription")).toBeTruthy();
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "deleteEvent" }),
  );
  await waitFor(() =>
    expect(state.remove).toHaveBeenCalledWith({ eventId: "event-id" }),
  );
});

test("an active room hides event editing and deletion", () => {
  state.canEdit = true;
  state.activeRoom = true;
  render(<EventDetailUnderTest />);
  expect(screen.queryByRole("button", { name: "editEvent" })).toBeNull();
  expect(screen.queryByRole("button", { name: "deleteEvent" })).toBeNull();
  expect(screen.getByText("activeRoomEditingBlocked")).toBeTruthy();
});

test("a recordings link opens the past carousel and its shared player", () => {
  state.tab = "tab=recordings";
  state.pastResults = [
    {
      _id: "recorded-occurrence",
      eventId: "event-id",
      start: 100,
      end: 200,
      status: "completed",
      roomName: "event-room",
      hasRecording: true,
    },
  ];
  render(<EventDetailUnderTest />);
  expect(screen.queryByRole("tab")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "carousel-watch" }));
  expect(screen.getByTestId("event-recording-player").textContent).toBe(
    "recorded-occurrence",
  );
});

test("the past-session carousel opens the same recording player", () => {
  state.pastResults = [
    {
      _id: "recorded-occurrence",
      eventId: "event-id",
      start: 100,
      end: 200,
      status: "completed",
      roomName: "event-room",
      hasRecording: true,
    },
  ];
  render(<EventDetailUnderTest />);
  fireEvent.click(screen.getByRole("button", { name: "carousel-watch" }));
  expect(screen.getByTestId("event-recording-player").textContent).toBe(
    "recorded-occurrence",
  );
  expect(screen.queryByText("noUpcoming")).toBeNull();
});

test("a recording notification opens its exact video outside the loaded history page", () => {
  state.tab = "tab=recordings";
  state.recordingId = "older-recording";
  state.recordingTarget = {
    _id: "older-occurrence",
    start: 100,
    end: 200,
    recording: {
      _id: "older-recording",
      url: "https://example.com/older.mp4",
      durationMs: 1_000,
      startedAt: 120,
    },
  };
  render(<EventDetailUnderTest />);
  expect(screen.getByTestId("event-recording-player").textContent).toBe(
    "older-occurrence",
  );
  expect(screen.getByTestId("target-recording").textContent).toBe(
    "older-recording",
  );
  fireEvent.click(screen.getByRole("button", { name: "close-player" }));
  expect(screen.queryByTestId("event-recording-player")).toBeNull();
});

test("event detail presents a live date", () => {
  state.nextResult = {
    _id: "live-occurrence",
    eventId: "event-id",
    start: 100,
    end: 200,
    status: "active",
    roomName: "event-room",
  };
  state.nextRoomStatus = { status: "active", canStart: false };
  render(<EventDetailUnderTest />);
  expect(screen.getByRole("heading", { name: "Assembly" })).toBeTruthy();
  expect(screen.getByText("scope").nextElementSibling?.textContent).toBe(
    "scopeInstitution",
  );
  expect(screen.getByText("audience").nextElementSibling?.textContent).toBe(
    "wholeInstitution",
  );
  expect(screen.getByText("responsible").nextElementSibling?.textContent).toBe(
    "Teacher",
  );
  expect(screen.getByText("schedule").nextElementSibling?.textContent).toBe(
    "single · UTC",
  );
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(screen.getByText("student.liveNow")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "enterRoom" }).getAttribute("href"),
  ).toBe("/school-a/classroom/event-room");
  expect(screen.queryByTestId("event-occurrence")).toBeNull();
});

test("event detail offers room access only when the session can start", () => {
  state.nextResult = {
    _id: "session-1",
    eventId: "event-id",
    start: 180_000,
    end: 240_000,
    status: "scheduled",
    roomName: "event-room",
  };
  const view = render(<EventDetailUnderTest />);
  expect(screen.queryByRole("link", { name: "enterRoom" })).toBeNull();
  expect(screen.queryByRole("link", { name: "startRoom" })).toBeNull();

  state.nextRoomStatus = { status: "scheduled", canStart: true };
  view.rerender(<EventDetailUnderTest />);
  expect(screen.getByRole("link", { name: "startRoom" })).toBeTruthy();
});

test("a recently completed event remains in focus with direct access to reopen", () => {
  state.nextResult = {
    _id: "reopenable-occurrence",
    eventId: "event-id",
    start: 180_000,
    end: 240_000,
    status: "completed",
    roomName: "event-room",
  };
  state.nextRoomStatus = {
    status: "completed",
    canStart: false,
    canReopen: true,
  };
  render(<EventDetailUnderTest />);
  expect(
    screen.getByRole("link", { name: "reopen" }).getAttribute("href"),
  ).toBe("/school-a/classroom/event-room");
});

test("an event with no future session never flashes the next-session panel while loading", () => {
  state.nextResult = undefined;
  const view = render(<EventDetailUnderTest />);
  expect(screen.queryByText("nextSession:")).toBeNull();

  state.nextResult = null;
  view.rerender(<EventDetailUnderTest />);
  expect(screen.queryByText("nextSession:")).toBeNull();

  state.now = 120_000;
  state.nextResult = undefined;
  view.rerender(<EventDetailUnderTest />);
  expect(screen.queryByText("nextSession:")).toBeNull();

  state.nextResult = null;
  view.rerender(<EventDetailUnderTest />);
  expect(screen.queryByText("nextSession:")).toBeNull();
});

test("the next session stays visible while a new minute's query loads", () => {
  state.nextResult = {
    _id: "session-1",
    eventId: "event-id",
    start: 180_000,
    end: 240_000,
    status: "scheduled",
    roomName: "event-room",
  };
  const view = render(<EventDetailUnderTest />);
  expect(screen.getByText("nextSession:")).toBeTruthy();

  state.now = 120_000;
  state.nextResult = undefined;
  view.rerender(<EventDetailUnderTest />);
  expect(screen.getByText("nextSession:")).toBeTruthy();
});

test("events show the next session and at most three selectable later dates", () => {
  state.nextResult = {
    _id: "session-1",
    eventId: "event-id",
    start: 60_000,
    end: 90_000,
    status: "scheduled",
    roomName: "event-room",
  };
  state.upcomingResults = [1, 2, 3, 4, 5].map((index) => ({
    _id: `session-${index}`,
    eventId: "event-id",
    start: index * 60_000,
    end: index * 60_000 + 30_000,
    status: "scheduled",
    roomName: "event-room",
  }));
  render(<EventDetailUnderTest />);

  expect(screen.getByText("nextSession:")).toBeTruthy();
  expect(screen.getByText("upcoming")).toBeTruthy();
  expect(screen.getByRole("button", { name: /12:04 AM/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /12:05 AM/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /12:02 AM/ }));
  expect(screen.getByTestId("event-occurrence").textContent).toBe("session-2");
  expect(screen.queryByRole("button", { name: "showAllUpcoming" })).toBeNull();
});

test("a recordings link focuses past sessions when event detail is already open", () => {
  state.pastResults = [
    {
      _id: "recorded-occurrence",
      eventId: "event-id",
      start: 100,
      end: 200,
      status: "completed",
      roomName: "event-room",
      hasRecording: true,
    },
  ];
  const view = render(<EventDetailUnderTest />);
  const scrollIntoView = vi.fn();
  Object.defineProperty(
    document.getElementById("event-past-sessions"),
    "scrollIntoView",
    {
      configurable: true,
      value: scrollIntoView,
    },
  );
  state.tab = "tab=recordings";
  view.rerender(<EventDetailUnderTest />);
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.getByRole("button", { name: "carousel-watch" })).toBeTruthy();
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

test("event history pages keep their time boundary when the live clock advances", () => {
  const view = render(<EventDetailUnderTest />);
  expect(state.calls).toEqual([
    { eventId: "event-id", category: "upcoming", now: 60_000 },
    { eventId: "event-id", category: "past", now: 60_000 },
  ]);
  expect(state.nextTimes).toEqual([60_000]);

  state.calls = [];
  state.now = 120_000;
  view.rerender(<EventDetailUnderTest />);
  expect(state.calls).toEqual([
    { eventId: "event-id", category: "upcoming", now: 60_000 },
    { eventId: "event-id", category: "past", now: 60_000 },
  ]);
  expect(state.nextTimes).toEqual([60_000, 120_000]);

  state.calls = [];
  state.now = 180_000;
  state.eventId = "next-event";
  view.rerender(<EventDetailUnderTest />);
  expect(state.calls.slice(-2)).toEqual([
    { eventId: "next-event", category: "upcoming", now: 180_000 },
    { eventId: "next-event", category: "past", now: 180_000 },
  ]);
});

test("the event detail does not request or display cancelled dates", () => {
  render(<EventDetailUnderTest />);
  expect(state.calls.map((call) => call.category)).toEqual([
    "upcoming",
    "past",
  ]);
  expect(screen.getByText("noSessions")).toBeTruthy();
  expect(screen.queryByText("cancelled")).toBeNull();
});

test("a finished session enters history while the event detail stays open", () => {
  state.nextResult = {
    _id: "session-1",
    eventId: "event-id",
    start: 60_000,
    end: 120_000,
    status: "scheduled",
    roomName: "event-room",
  };
  state.pastVisibleAfter = 120_000;
  state.pastResults = [
    {
      _id: "session-1",
      eventId: "event-id",
      start: 60_000,
      end: 120_000,
      status: "completed",
      roomName: "event-room",
      hasRecording: false,
    },
  ];
  const view = render(<EventDetailUnderTest />);
  expect(screen.getByText("nextSession:")).toBeTruthy();

  state.now = 120_000;
  state.nextResult = null;
  view.rerender(<EventDetailUnderTest />);
  expect(state.calls).toContainEqual({
    eventId: "event-id",
    category: "past",
    now: 120_000,
  });
  expect(screen.getByText("carousel-watch")).toBeTruthy();
  expect(screen.queryByText("noSessions")).toBeNull();

  state.calls = [];
  state.now = 180_000;
  view.rerender(<EventDetailUnderTest />);
  expect(state.calls).toContainEqual({
    eventId: "event-id",
    category: "past",
    now: 120_000,
  });
});

test("an early closure refreshes the history boundary before the scheduled end", () => {
  state.nextResult = {
    _id: "session-1",
    eventId: "event-id",
    start: 60_000,
    end: 240_000,
    status: "active",
    roomName: "event-room",
  };
  state.pastVisibleAfter = 120_000;
  state.pastResults = [
    {
      _id: "session-1",
      eventId: "event-id",
      start: 60_000,
      end: 240_000,
      status: "completed",
      roomName: "event-room",
      hasRecording: true,
    },
  ];
  const view = render(<EventDetailUnderTest />);
  state.now = 120_000;
  state.nextResult = null;
  view.rerender(<EventDetailUnderTest />);
  expect(state.calls).toContainEqual({
    eventId: "event-id",
    category: "past",
    now: 120_000,
  });
  expect(screen.getByText("carousel-watch")).toBeTruthy();
});
