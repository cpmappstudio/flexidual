import type { ComponentProps, ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import StudentHubPage from "@/components/dashboards/student-hub-page";
import messages from "@/messages/en.json";

type DashboardEvent = {
  occurrenceId: string;
  eventId: string;
  title: string;
  start: number;
  end: number;
  status: "scheduled" | "active";
  isLive: boolean;
};

const state = vi.hoisted(() => ({
  requests: [] as { name: string; args: unknown }[],
  events: [] as {
    scheduleId: string;
    className: string;
    title: string;
    start: number;
    end: number;
    status: string;
    sessionType: string;
    isLive: boolean;
  }[],
  eventOccurrences: [] as DashboardEvent[],
  campusEventOccurrences: [] as DashboardEvent[],
  schoolEventStatus: "Exhausted" as "Exhausted" | "CanLoadMore",
  loadMoreScopes: [] as string[],
  courses: [] as {
    classId: string;
    className: string;
    timeZone: string;
    canViewPrerecordedProgress: boolean;
    teacher: { fullName: string };
  }[],
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, user: { firstName: "Student" } }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/dashboards/student-attendance-summary", () => ({
  StudentAttendanceSummary: () => null,
}));
vi.mock("@/components/dashboards/student-pending-tasks", () => ({
  StudentPendingTasks: () => null,
}));
vi.mock("@/components/presence/user-presence", () => ({
  UserPresenceText: () => null,
}));
vi.mock("@/components/schedule/next-class-panel", () => ({
  NextClassPreview: () => null,
  NextClassPanel: ({
    nextClass,
    action,
  }: {
    nextClass?: { title: string } | null;
    action?: ReactNode;
  }) => (
    <>
      <p>{nextClass?.title ?? "No next class"}</p>
      {action}
    </>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query);
    state.requests.push({ name, args });
    if (args === "skip") return undefined;
    if (name === "student:getStudentDashboardStats")
      return {
        student: { fullName: "Student Test" },
        canEdit: false,
        classes: state.courses,
        overall: {
          attendanceCounts: { present: 0, partial: 0, absent: 0, excused: 0 },
          verifiedSessions: 0,
          pendingVerification: 0,
        },
        pendingAttendanceSessions: [],
        upcomingLessons: [],
      };
    if (
      name === "schedule:getMySchedule" ||
      name === "student:getStudentDashboardSchedule"
    )
      return state.events;
    if (name === "schedule:listAccessibleLiveClasses") return [];
    return null;
  },
  usePaginatedQuery: (
    query: Parameters<typeof getFunctionName>[0],
    args: { scope: "school" | "campus" },
  ) => {
    state.requests.push({ name: getFunctionName(query), args });
    if (getFunctionName(query) === "videoViewingProgress:courseReport")
      return { results: [], status: "Exhausted", loadMore: vi.fn() };
    return {
      results:
        args.scope === "school"
          ? state.eventOccurrences
          : state.campusEventOccurrences,
      status: args.scope === "school" ? state.schoolEventStatus : "Exhausted",
      loadMore: () => state.loadMoreScopes.push(args.scope),
    };
  },
}));
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  state.requests = [];
  state.events = [];
  state.eventOccurrences = [];
  state.campusEventOccurrences = [];
  state.schoolEventStatus = "Exhausted";
  state.loadMoreScopes = [];
  state.courses = [];
});

test("the profile offers progress only for permitted courses and removes the action when access is revoked", () => {
  state.courses = [
    {
      classId: "allowed",
      className: "My course",
      timeZone: "UTC",
      canViewPrerecordedProgress: true,
      teacher: { fullName: "Teacher" },
    },
    {
      classId: "denied",
      className: "Other course",
      timeZone: "UTC",
      canViewPrerecordedProgress: false,
      teacher: { fullName: "Other teacher" },
    },
  ];
  const page = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <StudentHubPage studentId="learner" />
    </NextIntlClientProvider>
  );
  const view = render(page());
  expect(
    screen.getByRole("button", {
      name: "Prerecorded class progress · My course",
    }),
  ).toBeDefined();
  expect(
    screen.queryByRole("button", {
      name: "Prerecorded class progress · Other course",
    }),
  ).toBeNull();
  expect(
    state.requests.some(
      ({ name }) => name === "videoViewingProgress:courseReport",
    ),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Prerecorded class progress · My course",
    }),
  );
  expect(screen.getByRole("dialog")).toBeDefined();
  const reportRequests = state.requests.filter(
    ({ name }) => name === "videoViewingProgress:courseReport",
  ).length;
  state.courses = state.courses.map((course) => ({
    ...course,
    canViewPrerecordedProgress: false,
  }));
  view.rerender(page());
  expect(
    screen.queryByRole("button", {
      name: "Prerecorded class progress · My course",
    }),
  ).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    state.requests.filter(
      ({ name }) => name === "videoViewingProgress:courseReport",
    ),
  ).toHaveLength(reportRequests);
});

test("a class wins an overlapping event, while an event alone gets the focus", () => {
  vi.useFakeTimers();
  const now = new Date(2026, 9, 14, 9, 0).getTime();
  vi.setSystemTime(now);
  state.events = [
    {
      scheduleId: "class-1",
      className: "Math",
      title: "Math",
      start: now + 60 * 60_000,
      end: now + 2 * 60 * 60_000,
      status: "scheduled",
      sessionType: "live",
      isLive: false,
    },
  ];
  state.eventOccurrences = [
    {
      occurrenceId: "date-1",
      eventId: "event-1",
      title: "Assembly",
      start: now + 30 * 60_000,
      end: now + 90 * 60_000,
      status: "scheduled",
      isLive: false,
    },
  ];
  const view = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <StudentHubPage />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view());
  expect(screen.getByText("Math")).toBeDefined();
  expect(screen.queryByText("Assembly")).toBeNull();

  state.eventOccurrences = [
    { ...state.eventOccurrences[0], end: now + 55 * 60_000 },
  ];
  rerender(view());
  expect(screen.getByText("Assembly")).toBeDefined();

  state.events = [];
  rerender(view());
  expect(screen.getByText("Assembly")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "View event" }).getAttribute("href"),
  ).toBe("/campus/calendar?eventId=event-1");
});

test("the earliest eligible event wins across school and campus pages", () => {
  vi.useFakeTimers();
  const now = new Date(2026, 9, 14, 9, 0).getTime();
  vi.setSystemTime(now);
  state.events = [
    {
      scheduleId: "class-1",
      className: "Math",
      title: "Math",
      start: now + 60 * 60_000,
      end: now + 2 * 60 * 60_000,
      status: "scheduled",
      sessionType: "live",
      isLive: false,
    },
  ];
  state.eventOccurrences = [
    {
      occurrenceId: "school-overlap",
      eventId: "school-event",
      title: "School assembly",
      start: now + 30 * 60_000,
      end: now + 90 * 60_000,
      status: "scheduled",
      isLive: false,
    },
  ];
  state.campusEventOccurrences = [
    {
      occurrenceId: "campus-event",
      eventId: "campus-event",
      title: "Campus assembly",
      start: now + 10 * 60_000,
      end: now + 40 * 60_000,
      status: "scheduled",
      isLive: false,
    },
  ];
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <StudentHubPage />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("Campus assembly")).toBeDefined();
  expect(screen.queryByText("School assembly")).toBeNull();
});

test("loads another page when the current event has already ended", () => {
  vi.useFakeTimers();
  const now = new Date(2026, 9, 14, 9, 0).getTime();
  vi.setSystemTime(now);
  state.schoolEventStatus = "CanLoadMore";
  state.eventOccurrences = [
    {
      occurrenceId: "past-date",
      eventId: "event-1",
      title: "Morning event",
      start: now - 2 * 60 * 60_000,
      end: now - 60 * 60_000,
      status: "scheduled",
      isLive: false,
    },
  ];
  const view = () => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
      <StudentHubPage />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view());
  expect(state.loadMoreScopes).toContain("school");
  expect(screen.getByText("No next class")).toBeDefined();

  state.schoolEventStatus = "Exhausted";
  state.eventOccurrences = [
    ...state.eventOccurrences,
    {
      occurrenceId: "next-date",
      eventId: "event-2",
      title: "Afternoon event",
      start: now + 2 * 60 * 60_000,
      end: now + 3 * 60 * 60_000,
      status: "scheduled",
      isLive: false,
    },
  ];
  rerender(view());
  expect(screen.getByText("Afternoon event")).toBeDefined();
});

test.each([undefined, "student-id"])(
  "hub statistics and day subscriptions stay stable across minutes (profile=%s)",
  async (studentId) => {
    vi.useFakeTimers();
    const initial = new Date(2026, 9, 14, 12, 0).getTime();
    vi.setSystemTime(initial);
    state.events = [
      {
        scheduleId: "scheduled",
        className: "Math",
        title: "Math",
        start: initial,
        end: initial + 60_000,
        status: "scheduled",
        sessionType: "live",
        isLive: false,
      },
    ];
    const view = () => (
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <StudentHubPage studentId={studentId} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view());
    expect(screen.getByText("Math")).toBeDefined();
    const scheduleName = studentId
      ? "student:getStudentDashboardSchedule"
      : "schedule:getMySchedule";
    const keys = (name: string) => [
      ...new Set(
        state.requests
          .filter((row) => row.name === name && row.args !== "skip")
          .map((row) => JSON.stringify(row.args)),
      ),
    ];
    const initialStats = keys("student:getStudentDashboardStats");
    const initialDay = keys(scheduleName);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(screen.getByText("No next class")).toBeDefined();
    expect(keys("student:getStudentDashboardStats")).toEqual(initialStats);
    expect(keys(scheduleName)).toEqual(initialDay);
    expect(initialStats[0]).not.toContain('"now"');
    state.events = [{ ...state.events[0], status: "active", isLive: true }];
    rerender(view());
    expect(screen.getByText("Math")).toBeDefined();
    state.events = [{ ...state.events[0], status: "completed", isLive: false }];
    rerender(view());
    expect(screen.getByText("No next class")).toBeDefined();
    expect(keys(scheduleName)).toEqual(initialDay);
    await act(async () => {
      vi.setSystemTime(new Date(2026, 9, 15, 0, 0));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(keys(scheduleName)).toHaveLength(2);
    expect(keys("student:getStudentDashboardStats")).toEqual(initialStats);
  },
);
