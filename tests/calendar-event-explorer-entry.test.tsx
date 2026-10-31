import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TZDate } from "@date-fns/tz";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { EventOccurrenceDialog } from "@/components/calendar/dialog/calendar-occurrence-dialog";
import type { InstitutionalCalendarEvent } from "@/components/calendar/calendar-types";

const state = vi.hoisted(() => ({
  now: 1_000,
  recordings: [] as Array<{ url: string }>,
  roomStatus: null as null | {
    status: "scheduled" | "active" | "completed";
    canStart: boolean;
    canReopen: boolean;
  },
  cancelOccurrence: vi.fn(async () => null),
  cancelFuture: vi.fn(async () => null),
  reopen: vi.fn(async () => null),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "school-a" }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/use-current-minute", () => ({
  useCurrentMinute: () => state.now,
}));
vi.mock("convex/react", () => ({
  useMutation: (mutation: FunctionReference<"mutation">) => {
    const name = getFunctionName(mutation);
    if (name === getFunctionName(api.events.cancelOccurrence))
      return state.cancelOccurrence;
    if (name === getFunctionName(api.eventRoom.reopen)) return state.reopen;
    return state.cancelFuture;
  },
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    if (
      getFunctionName(query) === getFunctionName(api.eventRoom.getSessionStatus)
    )
      return state.roomStatus;
    return getFunctionName(query) ===
      getFunctionName(api.recordings.getByEventOccurrence)
      ? args === "skip"
        ? undefined
        : state.recordings
      : false;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

beforeEach(() => {
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
  state.now = 1_000;
  state.recordings = [];
  state.roomStatus = null;
  state.cancelOccurrence.mockClear();
  state.cancelFuture.mockClear();
  state.reopen.mockClear();
  state.push.mockClear();
});

const event = {
  kind: "event",
  id: "occurrence-a",
  occurrenceId: "occurrence-a" as Id<"eventOccurrences">,
  eventId: "event-a" as Id<"events">,
  schoolId: "school-a" as Id<"schools">,
  title: "Devotional",
  description: "",
  start: new TZDate(2_000, "America/Bogota"),
  end: new TZDate(3_000, "America/Bogota"),
  actualStart: 2_000,
  actualEnd: 3_000,
  timeZone: "America/Bogota",
  color: "amber",
  status: "scheduled",
  isLive: false,
  sessionType: "live",
  roomName: "room-a",
  teacherIds: [],
  responsibleName: "Teacher",
  canManage: false,
  canEdit: false,
  canCancelOccurrence: false,
} satisfies InstitutionalCalendarEvent;

test("view event from a calendar date opens the selected event in the explorer", () => {
  const onOpenChange = vi.fn();
  const onViewEvent = vi.fn();

  render(
    <EventOccurrenceDialog
      event={event}
      open
      onOpenChange={onOpenChange}
      onViewEvent={onViewEvent}
      displayTimeZone="America/Bogota"
    />,
  );
  expect(screen.queryByRole("link", { name: "enterRoom" })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Devotional" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onViewEvent).toHaveBeenCalledWith("event-a");
});

test.each([
  { status: "scheduled", canStart: true, canReopen: false, label: "startRoom" },
  { status: "active", canStart: false, canReopen: false, label: "enterRoom" },
  { status: "completed", canStart: false, canReopen: true, label: "reopen" },
] as const)(
  "event $status offers $label with cancellation when still scheduled",
  ({ status, canStart, canReopen, label }) => {
    const actualStart = Date.parse("2026-10-29T15:00:00Z");
    state.now =
      status === "completed"
        ? actualStart + 65 * 60_000
        : actualStart - 30 * 60_000;
    state.roomStatus = { status, canStart, canReopen };
    render(
      <EventOccurrenceDialog
        event={{
          ...event,
          actualStart,
          actualEnd: actualStart + 60 * 60_000,
          status,
          isLive: status === "active",
          canCancelOccurrence: true,
        }}
        open
        onOpenChange={vi.fn()}
        displayTimeZone="America/Bogota"
      />,
    );

    if (status === "completed") {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    } else {
      expect(
        screen.getByRole("link", { name: label }).getAttribute("href"),
      ).toBe("/en/school-a/classroom/room-a");
    }
    if (status === "scheduled") {
      expect(screen.getByRole("button", { name: "cancelDate" })).toBeTruthy();
    } else {
      expect(screen.queryByRole("button", { name: "cancelDate" })).toBeNull();
    }
    expect(screen.queryByRole("button", { name: "viewEvent" })).toBeNull();
  },
);

test("a closed room does not offer entry when the calendar still has a live snapshot", () => {
  state.now = 2_500;
  state.recordings = [{ url: "https://example.com/recording.mp4" }];
  state.roomStatus = {
    status: "completed",
    canStart: false,
    canReopen: false,
  };
  render(
    <EventOccurrenceDialog
      event={{ ...event, status: "active", isLive: true }}
      open
      onOpenChange={vi.fn()}
      displayTimeZone="America/Bogota"
    />,
  );

  expect(screen.queryByRole("link", { name: "enterRoom" })).toBeNull();
  expect(screen.queryByText("live")).toBeNull();
  expect(screen.getByText("completed")).toBeTruthy();
  expect(screen.getByRole("link", { name: "recordings" })).toBeTruthy();
});

test("event dates use the same calendar summary layout in the event time zone", () => {
  const actualStart = Date.parse("2026-10-27T19:00:00Z");
  render(
    <EventOccurrenceDialog
      event={{
        ...event,
        actualStart,
        actualEnd: actualStart + 60 * 60_000,
      }}
      open
      onOpenChange={vi.fn()}
      displayTimeZone="America/Bogota"
    />,
  );

  expect(screen.getByText("Tuesday, October 27, 2026")).toBeTruthy();
  expect(screen.getByText(/02:00 PM - 03:00 PM/)).toBeTruthy();
  expect(screen.getByText(/60 minutes/)).toBeTruthy();
  expect(screen.getByText("with Teacher")).toBeTruthy();
  expect(
    screen.getByRole("dialog").querySelector(".lucide-building-2"),
  ).toBeTruthy();
  expect(
    screen.getByRole("dialog").querySelector(".lucide-users-round"),
  ).toBeTruthy();
});

test("reopening an event confirms the action before entering the room", async () => {
  const actualStart = Date.parse("2026-10-29T15:00:00Z");
  state.now = actualStart + 65 * 60_000;
  state.roomStatus = {
    status: "completed",
    canStart: false,
    canReopen: true,
  };
  render(
    <EventOccurrenceDialog
      event={{
        ...event,
        actualStart,
        actualEnd: actualStart + 60 * 60_000,
        status: "completed",
      }}
      open
      onOpenChange={vi.fn()}
      displayTimeZone="America/Bogota"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "reopen" }));
  expect(state.reopen).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "confirmReopen",
    }),
  );
  await waitFor(() => {
    expect(state.reopen).toHaveBeenCalledWith({ roomName: "room-a" });
    expect(state.push).toHaveBeenCalledWith("/en/school-a/classroom/room-a");
  });
});

test("recordings stay in the explorer and the detail omits a redundant event link", () => {
  state.now = 4_000;
  state.recordings = [{ url: "recording" }];
  state.roomStatus = {
    status: "completed",
    canStart: false,
    canReopen: false,
  };
  const onOpenChange = vi.fn();
  const onViewEvent = vi.fn();
  render(
    <EventOccurrenceDialog
      event={event}
      open
      onOpenChange={onOpenChange}
      onViewEvent={onViewEvent}
      showViewEvent={false}
      displayTimeZone="America/Bogota"
    />,
  );
  expect(screen.queryByRole("button", { name: "viewEvent" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "recordings" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(onViewEvent).toHaveBeenCalledWith("event-a", "recordings");
});

test("occurrence details keep cancellation but direct scheduling belongs to event edit", () => {
  const actualStart = Date.parse("2026-10-26T14:00:00Z");
  const replacementEvent = {
    ...event,
    actualStart,
    actualEnd: actualStart + 60 * 60_000,
    start: new TZDate(actualStart, "America/Bogota"),
    end: new TZDate(actualStart + 60 * 60_000, "America/Bogota"),
    canEdit: true,
    canCancelOccurrence: true,
  };
  state.now = actualStart - 60_000;
  render(
    <EventOccurrenceDialog
      event={replacementEvent}
      open
      onOpenChange={vi.fn()}
      displayTimeZone="America/Bogota"
    />,
  );
  expect(screen.queryByRole("button", { name: "replaceFuture" })).toBeNull();
  expect(screen.queryByRole("button", { name: "editDate" })).toBeNull();
  expect(screen.getByRole("button", { name: "cancelDate" })).toBeTruthy();
});

test("event cancellation uses the class-style confirmation and selected scope", async () => {
  const actualStart = Date.parse("2026-10-27T19:00:00Z");
  state.now = actualStart - 60_000;
  render(
    <EventOccurrenceDialog
      event={{
        ...event,
        actualStart,
        actualEnd: actualStart + 60 * 60_000,
        canEdit: true,
        canCancelOccurrence: true,
      }}
      open
      onOpenChange={vi.fn()}
      displayTimeZone="America/Bogota"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "cancelDate" }));
  const confirmation = screen.getByRole("alertdialog");
  expect(within(confirmation).getByText("Devotional")).toBeTruthy();
  expect(
    within(confirmation).getByText("Tuesday, October 27, 2026"),
  ).toBeTruthy();
  expect(within(confirmation).getByText("cancelDateDescription")).toBeTruthy();
  expect(
    within(confirmation).getByText("cancelFutureDescription"),
  ).toBeTruthy();

  fireEvent.click(within(confirmation).getByText("cancelFuture"));
  fireEvent.change(within(confirmation).getByLabelText(/reason/), {
    target: { value: "School closure" },
  });
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "confirmCancelFuture" }),
  );

  await waitFor(() =>
    expect(state.cancelFuture).toHaveBeenCalledWith({
      occurrenceId: "occurrence-a",
      reason: "School closure",
    }),
  );
  expect(state.cancelOccurrence).not.toHaveBeenCalled();
});

test("cancelling one event date leaves the future-date mutation untouched", async () => {
  const actualStart = Date.parse("2026-10-27T19:00:00Z");
  state.now = actualStart - 60_000;
  render(
    <EventOccurrenceDialog
      event={{
        ...event,
        actualStart,
        actualEnd: actualStart + 60 * 60_000,
        canEdit: true,
        canCancelOccurrence: true,
      }}
      open
      onOpenChange={vi.fn()}
      displayTimeZone="America/Bogota"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "cancelDate" }));
  const confirmation = screen.getByRole("alertdialog");
  fireEvent.change(within(confirmation).getByLabelText(/reason/), {
    target: { value: "No venue available" },
  });
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "cancelDate" }),
  );

  await waitFor(() =>
    expect(state.cancelOccurrence).toHaveBeenCalledWith({
      occurrenceId: "occurrence-a",
      reason: "No venue available",
    }),
  );
  expect(state.cancelFuture).not.toHaveBeenCalled();
});
